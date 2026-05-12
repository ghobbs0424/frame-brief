// api/recall-webhook.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const RECALL_KEY = process.env.RECALL_API_KEY;
const RECALL_REGION = "us-west-2";

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // ── Create bot ──────────────────────────────────────────────────────────
    if (req.query.action === "create-bot") {
      const { meetingUrl, projectId } = req.body || {};
      console.log("create-bot:", meetingUrl, projectId);

      if (!meetingUrl) return res.status(400).json({ error: "meetingUrl is required" });

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
      console.log("Recall create-bot response:", recallRes.status, JSON.stringify(botData).slice(0, 200));

      if (!recallRes.ok) {
        return res.status(recallRes.status).json({
          error: botData?.message || botData?.detail || JSON.stringify(botData)
        });
      }

      if (projectId) {
        const { error: dbErr } = await supabase.from("projects").update({
          recall_bot_id: botData.id,
          recall_status: "bot_joined",
          updated_at: new Date().toISOString(),
        }).eq("id", projectId);
        console.log("Saved bot to project:", projectId, "error:", dbErr?.message);
      }

      return res.status(200).json({ botId: botData.id, status: botData.status });
    }

    // ── Fetch transcript manually ────────────────────────────────────────────
    if (req.query.action === "fetch-transcript") {
      const { botId, projectId } = req.body || {};
      console.log("fetch-transcript:", botId, projectId);

      if (!botId || !projectId) return res.status(400).json({ error: "botId and projectId required" });

      const tRes = await fetch(
        `https://${RECALL_REGION}.recall.ai/api/v1/bot/${botId}/transcript`,
        { headers: { "Authorization": `Token ${RECALL_KEY}`, "Content-Type": "application/json" } }
      );
      const tData = await tRes.json();
      console.log("Transcript fetch status:", tRes.status, "sample:", JSON.stringify(tData).slice(0, 300));

      let text = "";
      if (Array.isArray(tData)) {
        text = tData
          .map(seg => `${seg.speaker || "Speaker"}: ${(seg.words || []).map(w => w.text || w.word || "").join(" ")}`)
          .filter(line => line.length > 10)
          .join("\n\n");
      } else if (tData && tData.transcript) {
        text = tData.transcript;
      }

      if (!text.trim()) {
        return res.status(200).json({ ok: false, message: "No transcript yet", raw: JSON.stringify(tData).slice(0, 300) });
      }

      await supabase.from("projects").update({
        recall_status: "transcript_ready",
        recall_transcript: text,
        updated_at: new Date().toISOString(),
      }).eq("id", projectId);

      // Generate brief with Claude
      await generateBrief(projectId, text);

      return res.status(200).json({ ok: true, transcriptLength: text.length });
    }

    // ── Receive Recall webhook ───────────────────────────────────────────────
    const event = req.body;
    const eventName = event && event.event;
    // Log full payload every time so we can see exact structure from Recall
    console.log("Webhook event:", eventName, "full payload:", JSON.stringify(event));

    const transcriptionTriggerEvents = ["status.recording_done", "status.done"];
    const handledEvents = [...transcriptionTriggerEvents, "transcript.done", "transcript.failed"];
    if (!event || !handledEvents.includes(eventName)) {
      console.log("Skipping unhandled event:", eventName);
      return res.status(200).json({ ok: true, skipped: eventName });
    }

    // Recall status events carry bot_id at event.data.bot_id or event.data.id
    const botId = (event.data && (event.data.bot_id || event.data.id))
      || (event.data && event.data.bot && event.data.bot.id);
    // recording_id may be directly in event data, or nested under a recording object
    const recordingIdFromEvent = (event.data && event.data.recording_id)
      || (event.data && event.data.recording && event.data.recording.id);
    const transcriptId = event.data && event.data.transcript && event.data.transcript.id;
    console.log("botId:", botId, "recordingId (from event):", recordingIdFromEvent, "transcriptId:", transcriptId);

    if (!botId) return res.status(200).json({ ok: true, error: "no bot id in payload" });

    const { data: project, error: lookupErr } = await supabase
      .from("projects")
      .select("*")
      .eq("recall_bot_id", botId)
      .single();

    console.log("Project lookup:", project && project.id, "error:", lookupErr && lookupErr.message);
    if (!project) return res.status(200).json({ ok: true, error: "project not found for bot " + botId });

    // ── status.recording_done / status.done → trigger async transcription ────
    if (transcriptionTriggerEvents.includes(eventName)) {
      // Get recording_id — from event payload first, else fetch from bot API
      let recordingId = recordingIdFromEvent;
      if (!recordingId) {
        console.log("No recording_id in event — fetching from bot API");
        const botRes = await fetch(
          `https://${RECALL_REGION}.recall.ai/api/v1/bot/${botId}/`,
          { headers: { "Authorization": `Token ${RECALL_KEY}` } }
        );
        const botRaw = await botRes.text();
        console.log("Bot fetch status:", botRes.status, "response:", botRaw.slice(0, 500));
        if (botRes.ok) {
          const botData = JSON.parse(botRaw);
          // recordings is typically an array; grab the first/only one
          recordingId = (botData.recordings && botData.recordings[0] && botData.recordings[0].id)
            || (botData.recording && botData.recording.id);
          console.log("recording_id from bot API:", recordingId);
        }
      }

      if (!recordingId) {
        console.error("Could not find recording_id for bot:", botId);
        await supabase.from("projects").update({
          recall_status: "transcription_error",
          updated_at: new Date().toISOString(),
        }).eq("id", project.id);
        return res.status(200).json({ ok: false, error: "no recording_id found" });
      }

      const asyncUrl = `https://${RECALL_REGION}.recall.ai/api/v1/recording/${recordingId}/create_transcript/`;
      const asyncBody = { provider: { assembly_ai_async: {} } };
      console.log("Triggering async transcription — url:", asyncUrl, "body:", JSON.stringify(asyncBody));

      const asyncRes = await fetch(asyncUrl, {
        method: "POST",
        headers: { "Authorization": `Token ${RECALL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(asyncBody),
      });

      const rawText = await asyncRes.text();
      if (!asyncRes.ok) {
        console.error("ASYNC TRANSCRIPTION TRIGGER FAILED — status:", asyncRes.status, "response:", rawText);
        await supabase.from("projects").update({
          recall_status: "transcription_error",
          updated_at: new Date().toISOString(),
        }).eq("id", project.id);
        return res.status(200).json({ ok: false, status: asyncRes.status, body: rawText });
      }

      console.log("Async transcription triggered OK — status:", asyncRes.status, "response:", rawText);
      await supabase.from("projects").update({
        recall_status: "transcribing",
        updated_at: new Date().toISOString(),
      }).eq("id", project.id);

      return res.status(200).json({ ok: true, triggered: asyncRes.status });
    }

    // ── transcript.failed → log and mark error ───────────────────────────────
    if (eventName === "transcript.failed") {
      const subCode = event.data && event.data.data && event.data.data.sub_code;
      console.error("TRANSCRIPT FAILED — sub_code:", subCode, "botId:", botId, "recordingId:", recordingId);
      await supabase.from("projects").update({
        recall_status: "transcription_failed",
        updated_at: new Date().toISOString(),
      }).eq("id", project.id);
      return res.status(200).json({ ok: true, failed: true, sub_code: subCode });
    }

    // ── transcript.done → fetch transcript from bot, generate brief ───────────
    const tRes = await fetch(
      `https://${RECALL_REGION}.recall.ai/api/v1/bot/${botId}/transcript/`,
      { headers: { "Authorization": `Token ${RECALL_KEY}` } }
    );
    const tRaw = await tRes.text();
    console.log("Bot transcript fetch — status:", tRes.status, "sample:", tRaw.slice(0, 400));

    if (!tRes.ok) {
      console.error("Failed to fetch bot transcript — status:", tRes.status, "body:", tRaw);
      return res.status(200).json({ ok: false, error: "bot transcript fetch failed", status: tRes.status });
    }

    // Parse: Recall returns an array of speaker segments with word arrays
    let text = "";
    try {
      const tData = JSON.parse(tRaw);
      if (Array.isArray(tData)) {
        text = tData
          .map(seg => `${seg.speaker || "Speaker"}: ${(seg.words || []).map(w => w.text || w.word || "").join(" ")}`)
          .filter(line => line.length > 10)
          .join("\n\n");
      } else if (tData && typeof tData.transcript === "string") {
        text = tData.transcript;
      }
    } catch {
      text = tRaw;
    }

    console.log("Parsed transcript length:", text.length, "preview:", text.slice(0, 200));

    await supabase.from("projects").update({
      recall_status: text.trim() ? "transcript_ready" : "empty_transcript",
      recall_transcript: text || null,
      updated_at: new Date().toISOString(),
    }).eq("id", project.id);

    if (text.trim()) {
      await generateBrief(project.id, text);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function generateBrief(projectId, transcriptText) {
  try {
    const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_KEY;
    const SYSTEM = `You are a creative director AI for a video and photography production company. Analyze meeting notes and return ONLY a valid JSON object with no markdown or backticks. Return this structure: {"coverEmoji":"🎬","projectTitle":"","clientName":"","projectType":"","date":"","timeline":"","budget":"","logline":"","overview":"","moodKeywords":[],"moodDescription":"","references":[],"overallLocations":[],"overallWardrobe":[],"overallProps":[],"generalNotes":"","clientActionItems":[{"id":"ca-1","text":"","done":false}],"internalTodos":[{"id":"it-1","text":"","done":false}],"concepts":[{"id":"concept-1","emoji":"🎥","title":"","type":"","logline":"","description":"","moodKeywords":[],"inspiration":[],"locations":[],"lighting":{"style":"","description":"","technical":""},"colorHex":["#c8a97e","#3d2b1f","#f5ede0"],"colorDescription":"","wardrobe":[],"wardrobeNotes":"","props":[],"shotList":[{"number":"01","type":"","description":"","lens":"","notes":""}],"script":{"hook":"","act1":"","act2":"","act3":"","cta":""},"deliverableFormat":"","directorNotes":""}]}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{ role: "user", content: `Create a production brief from this meeting transcript:\n\n${transcriptText}` }],
      }),
    });

    const aiData = await aiRes.json();
    const raw = (aiData.content || []).map(b => b.text || "").join("").trim();

    let brief = null;
    try {
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s !== -1 && e !== -1) {
        let jsonStr = raw.slice(s, e + 1).replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
        brief = JSON.parse(jsonStr);
        if (!Array.isArray(brief.concepts)) brief.concepts = [];
        if (!brief.clientActionItems) brief.clientActionItems = [];
        if (!brief.internalTodos) brief.internalTodos = [];
      }
    } catch (parseErr) {
      console.error("Brief parse error:", parseErr.message);
    }

    if (brief) {
      await supabase.from("projects").update({
        title: brief.projectTitle || "Untitled",
        client_name: brief.clientName || "",
        brief: brief,
        recall_status: "brief_ready",
        updated_at: new Date().toISOString(),
      }).eq("id", projectId);
      console.log("Brief generated for project:", projectId);
    }
  } catch (err) {
    console.error("generateBrief error:", err.message);
  }
}
