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

// Required for Vercel to parse JSON body
export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  // Allow CORS from your app
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // ── Route 1: Create bot (called from browser via our proxy) ──
    if (req.query.action === "create-bot") {
      const { meetingUrl, projectId } = req.body || {};
      console.log("create-bot called:", { meetingUrl, projectId });

      if (!meetingUrl) return res.status(400).json({ error: "meetingUrl is required" });
      if (!RECALL_KEY) return res.status(500).json({ error: "RECALL_API_KEY not configured" });

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
          webhook_url: `https://frame-brief.vercel.app/api/recall-webhook`,
        }),
      });

      const botData = await recallRes.json();
      console.log("Recall response:", recallRes.status, JSON.stringify(botData));

      if (!recallRes.ok) {
        return res.status(recallRes.status).json({
          error: botData?.message || botData?.detail || JSON.stringify(botData) || "Failed to create bot"
        });
      }

      // Save bot ID to project if provided
      if (projectId) {
        await supabase.from("projects").update({
          recall_bot_id: botData.id,
          recall_status: "bot_joined",
          updated_at: new Date().toISOString(),
        }).eq("id", projectId);
      }

      return res.status(200).json({ botId: botData.id, status: botData.status });
    }

    // ── Route 2: Receive transcript from Recall.ai webhook ──
    const event = req.body;
    console.log("Recall webhook event:", event?.event, event?.data?.bot_id);

    const completionEvents = ["bot.done", "bot.transcription_complete", "transcript.done"];
    if (!completionEvents.includes(event?.event)) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const botId = event?.data?.bot_id;
    if (!botId) return res.status(200).json({ ok: true });

    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("recall_bot_id", botId)
      .single();

    if (!project) {
      console.log("No project found for bot:", botId);
      return res.status(200).json({ ok: true });
    }

    // Fetch transcript
    const transcriptRes = await fetch(
      `https://${RECALL_REGION}.recall.ai/api/v1/bot/${botId}/transcript`,
      { headers: { "Authorization": `Token ${RECALL_KEY}`, "Content-Type": "application/json" } }
    );

    const transcriptData = await transcriptRes.json();
    let transcriptText = "";

    if (Array.isArray(transcriptData)) {
      transcriptText = transcriptData
        .map(seg => `${seg.speaker || "Speaker"}: ${(seg.words || []).map(w => w.text).join(" ")}`)
        .filter(line => line.length > 10)
        .join("\n\n");
    } else if (transcriptData?.transcript) {
      transcriptText = transcriptData.transcript;
    }

    await supabase.from("projects").update({
      recall_status: transcriptText.trim() ? "transcript_ready" : "empty_transcript",
      recall_transcript: transcriptText || null,
      updated_at: new Date().toISOString()
    }).eq("id", project.id);

    console.log("✅ Transcript saved for project:", project.id);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}
