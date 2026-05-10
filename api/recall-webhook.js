// api/recall-webhook.js
// Handles both:
// POST /api/recall-webhook?action=create-bot  → creates a Recall bot (called from browser)
// POST /api/recall-webhook                    → receives transcript webhook (called from Recall.ai)

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const RECALL_KEY = process.env.RECALL_API_KEY;
const RECALL_REGION = "us-west-2";

export default async function handler(req, res) {
  // Allow CORS from your app
  res.setHeader("Access-Control-Allow-Origin", "https://frame-brief.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ── Route 1: Create bot (called from browser) ──────────────────────────
    if (req.query.action === "create-bot") {
      const { meetingUrl, projectId } = req.body;

      if (!meetingUrl) {
        return res.status(400).json({ error: "meetingUrl is required" });
      }

      const webhookUrl = `https://frame-brief.vercel.app/api/recall-webhook`;

      const recallRes = await fetch(`https://${RECALL_REGION}.recall.ai/api/v1/bot/`, {
        method: "POST",
        headers: {
          "Authorization": `Token ${RECALL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meeting_url: meetingUrl,
          bot_name: "Frame Brief",
          transcription_options: { provider: "assembly_ai" },
          webhook_url: webhookUrl,
        }),
      });

      const botData = await recallRes.json();

      if (!recallRes.ok) {
        console.error("Recall API error:", botData);
        return res.status(recallRes.status).json({ 
          error: botData?.message || botData?.detail || "Failed to create bot" 
        });
      }

      // If a projectId was passed, save the bot ID to that project
      if (projectId) {
        await supabase.from("projects").update({
          recall_bot_id: botData.id,
          recall_status: "bot_joined",
          updated_at: new Date().toISOString(),
        }).eq("id", projectId);
      }

      return res.status(200).json({ botId: botData.id, status: botData.status });
    }

    // ── Route 2: Receive transcript from Recall.ai webhook ─────────────────
    const event = req.body;
    console.log("Recall webhook event:", event?.event, event?.data?.bot_id);

    // Only process completion events
    const completionEvents = ["bot.done", "bot.transcription_complete", "transcript.done"];
    if (!completionEvents.includes(event?.event)) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const botId = event?.data?.bot_id;
    if (!botId) return res.status(200).json({ ok: true });

    // Find which project this bot belongs to
    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("recall_bot_id", botId)
      .single();

    if (!project) {
      console.log("No project found for bot:", botId);
      return res.status(200).json({ ok: true });
    }

    // Fetch the transcript from Recall.ai
    const transcriptRes = await fetch(
      `https://${RECALL_REGION}.recall.ai/api/v1/bot/${botId}/transcript`,
      {
        headers: {
          Authorization: `Token ${RECALL_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const transcriptData = await transcriptRes.json();

    // Build readable transcript text
    let transcriptText = "";
    if (Array.isArray(transcriptData)) {
      transcriptText = transcriptData
        .map(segment => {
          const speaker = segment.speaker || "Speaker";
          const words = arr(segment.words).map(w => w.text).join(" ");
          return `${speaker}: ${words}`;
        })
        .filter(line => line.trim().length > 10)
        .join("\n\n");
    } else if (transcriptData?.transcript) {
      transcriptText = transcriptData.transcript;
    }

    if (!transcriptText.trim()) {
      await supabase.from("projects").update({
        recall_status: "empty_transcript",
        updated_at: new Date().toISOString()
      }).eq("id", project.id);
      return res.status(200).json({ ok: true });
    }

    // Save transcript and mark ready
    await supabase.from("projects").update({
      recall_status: "transcript_ready",
      recall_transcript: transcriptText,
      updated_at: new Date().toISOString()
    }).eq("id", project.id);

    console.log("✅ Transcript saved for project:", project.id);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}

function arr(x) { return Array.isArray(x) ? x : []; }
