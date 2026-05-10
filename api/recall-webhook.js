// api/recall-webhook.js
// Vercel serverless function - receives transcripts from Recall.ai
// Deploy this file to your repo at: api/recall-webhook.js

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const event = req.body;
    console.log("Recall webhook received:", event?.event, event?.data?.bot_id);

    // Only process transcript ready events
    if (event?.event !== "bot.transcription_complete" && 
        event?.event !== "bot.done") {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const botId = event?.data?.bot_id;
    if (!botId) return res.status(200).json({ ok: true });

    // Look up which project this bot belongs to
    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("recall_bot_id", botId)
      .single();

    if (!project) {
      console.log("No project found for bot:", botId);
      return res.status(200).json({ ok: true });
    }

    // Fetch the full transcript from Recall.ai
    const transcriptRes = await fetch(
      `https://us-west-2.recall.ai/api/v1/bot/${botId}/transcript`,
      {
        headers: {
          Authorization: `Token ${process.env.RECALL_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const transcriptData = await transcriptRes.json();
    
    // Build transcript text from words
    let transcriptText = "";
    if (Array.isArray(transcriptData)) {
      transcriptText = transcriptData
        .map(segment => {
          const speaker = segment.speaker || "Speaker";
          const words = (segment.words || []).map(w => w.text).join(" ");
          return `${speaker}: ${words}`;
        })
        .join("\n\n");
    } else if (transcriptData.transcript) {
      transcriptText = transcriptData.transcript;
    }

    if (!transcriptText.trim()) {
      console.log("Empty transcript for bot:", botId);
      await supabase.from("projects").update({ 
        recall_status: "empty_transcript",
        updated_at: new Date().toISOString()
      }).eq("id", project.id);
      return res.status(200).json({ ok: true });
    }

    // Update project with transcript - mark as ready for brief generation
    await supabase.from("projects").update({
      recall_status: "transcript_ready",
      recall_transcript: transcriptText,
      updated_at: new Date().toISOString()
    }).eq("id", project.id);

    console.log("Transcript saved for project:", project.id);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}
