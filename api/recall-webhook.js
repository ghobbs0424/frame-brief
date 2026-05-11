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
        const { error: updateError } = await supabase.from("projects").update({
          recall_bot_id: botData.id,
          recall_status: "bot_joined",
          updated_at: new Date().toISOString(),
        }).eq("id", projectId);
        console.log("Saved bot ID to project:", projectId, "bot:", botData.id, "error:", updateError);
      }

      return res.status(200).json({ botId: botData.id, status: botData.status });
    }

    // ── Route 2: Receive transcript from Recall.ai webhook ──
    const event = req.body;
    console.log("Recall webhook event:", event?.event, event?.data?.bot_id);

    // Log full event for debugging
    console.log("Full event:", JSON.stringify(event).slice(0, 500));

    const completionEvents = ["bot.done", "bot.transcription_complete", "transcript.done", "bot.call_ended", "bot.complete"];
    if (!completionEvents.includes(event?.event)) {
      console.log("Skipping event:", event?.event);
      return res.status(200).json({ ok: true, skipped: true });
    }

    // Recall.ai sends bot_id in different places depending on event type
    const botId = event?.data?.bot_id || event?.data?.id || event?.bot_id;
    console.log("Bot ID from event:", botId, "event type:", event?.event);
    if (!botId) {
      console.log("No bot ID found in event:", JSON.stringify(event).slice(0, 300));
      return res.status(200).json({ ok: true });
    }

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


    // Save transcript
    await supabase.from("projects").update({
      recall_status: "transcript_ready",
      recall_transcript: transcriptText || null,
      updated_at: new Date().toISOString()
    }).eq("id", project.id);

    console.log("Transcript saved, generating brief for project:", project.id);

    // Auto-generate brief from transcript using Claude
    if (transcriptText && transcriptText.trim()) {
      try {
        const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_KEY;
        const SYSTEM = `You are a creative director AI. Analyze meeting notes and return ONLY valid JSON, no markdown, no backticks. Return this structure: {"coverEmoji":"🎬","projectTitle":"","clientName":"","projectType":"","date":"","timeline":"","budget":"","logline":"","overview":"","moodKeywords":[],"moodDescription":"","references":[],"overallLocations":[],"overallWardrobe":[],"overallProps":[],"generalNotes":"","clientActionItems":[{"id":"ca-1","text":"","done":false}],"internalTodos":[{"id":"it-1","text":"","done":false}],"concepts":[{"id":"concept-1","emoji":"🎥","title":"","type":"","logline":"","description":"","moodKeywords":[],"inspiration":[],"locations":[],"lighting":{"style":"","description":"","technical":""},"colorHex":["#c8a97e","#3d2b1f","#f5ede0"],"colorDescription":"","wardrobe":[],"wardrobeNotes":"","props":[],"shotList":[{"number":"01","type":"","description":"","lens":"","notes":""}],"script":{"hook":"","act1":"","act2":"","act3":"","cta":""},"deliverableFormat":"","directorNotes":""}]}`;

        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 8000,
            system: SYSTEM,
            messages: [{ role: "user", content: `Create a production brief from this meeting transcript:\n\n${transcriptText}` }]
          })
        });

        const aiData = await aiRes.json();
        const raw = (aiData.content || []).map(b => b.text || "").join("").trim();
        let brief = null;
        try {
          let jsonStr = raw;
          const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
          if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e+1);
          jsonStr = jsonStr.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
          brief = JSON.parse(jsonStr);
          if (!Array.isArray(brief.concepts)) brief.concepts = [];
          if (!brief.clientActionItems) brief.clientActionItems = [];
          if (!brief.internalTodos) brief.internalTodos = [];
        } catch(e) { console.error("Parse error:", e); }

        if (brief) {
          await supabase.from("projects").update({
            title: brief.projectTitle || "Untitled",
            client_name: brief.clientName || "",
            brief: brief,
            recall_status: "brief_ready",
            updated_at: new Date().toISOString()
          }).eq("id", project.id);
          console.log("Brief generated for project:", project.id);
        }
      } catch(aiErr) { console.error("Brief gen error:", aiErr); }
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}
