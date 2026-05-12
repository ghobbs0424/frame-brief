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

    // ── Fetch transcript manually (recovery action) ──────────────────────────
    if (req.query.action === "fetch-transcript") {
      const { botId, projectId } = req.body || {};
      console.log("fetch-transcript:", botId, projectId);
      if (!botId || !projectId) return res.status(400).json({ error: "botId and projectId required" });

      // Get bot to find the transcript ID
      const botRes = await fetch(
        `https://${RECALL_REGION}.recall.ai/api/v1/bot/${botId}/`,
        { headers: { "Authorization": `Token ${RECALL_KEY}` } }
      );
      const botData = await botRes.json();
      const transcriptId = botData.recordings?.[0]?.media_shortcuts?.transcript?.id;
      console.log("fetch-transcript: transcriptId:", transcriptId);

      if (!transcriptId) {
        return res.status(200).json({ ok: false, message: "No transcript found on bot", botStatus: JSON.stringify(botData.recordings?.[0]?.media_shortcuts?.transcript).slice(0, 200) });
      }

      const text = await downloadAndParseTranscript(transcriptId);
      if (!text.trim()) {
        return res.status(200).json({ ok: false, message: "Transcript empty or not ready" });
      }

      await supabase.from("projects").update({
        recall_status: "transcript_ready",
        recall_transcript: text,
        updated_at: new Date().toISOString(),
      }).eq("id", projectId);

      await generateBrief(projectId, text);
      return res.status(200).json({ ok: true, transcriptLength: text.length });
    }

    // ── Receive Recall webhook ───────────────────────────────────────────────
    const event = req.body;
    const eventName = event && event.event;
    // Log full payload every time so we can see exact structure from Recall
    console.log("Webhook event:", eventName, "full payload:", JSON.stringify(event));

    const transcriptionTriggerEvents = ["recording.done"];
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

    // ── recording.done → trigger async transcription ─────────────────────────
    if (transcriptionTriggerEvents.includes(eventName)) {
      // recording.done should carry recording_id directly; fall back to bot API if not
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
      const asyncBody = { provider: { recallai_async: { language_code: "en" } } };
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
      console.error("TRANSCRIPT FAILED — sub_code:", subCode, "botId:", botId, "recordingId:", recordingIdFromEvent);
      await supabase.from("projects").update({
        recall_status: "transcription_failed",
        updated_at: new Date().toISOString(),
      }).eq("id", project.id);
      return res.status(200).json({ ok: true, failed: true, sub_code: subCode });
    }

    // ── transcript.done → download via transcript ID, generate brief ──────────
    if (!transcriptId) {
      console.error("transcript.done received but no transcript.id in payload");
      return res.status(200).json({ ok: false, error: "no transcript id in payload" });
    }

    const text = await downloadAndParseTranscript(transcriptId);
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

async function downloadAndParseTranscript(transcriptId) {
  // GET /transcript/{id}/ to find download_url
  const metaRes = await fetch(
    `https://${RECALL_REGION}.recall.ai/api/v1/transcript/${transcriptId}/`,
    { headers: { "Authorization": `Token ${RECALL_KEY}` } }
  );
  const metaRaw = await metaRes.text();
  console.log("Transcript meta status:", metaRes.status, "sample:", metaRaw.slice(0, 300));
  if (!metaRes.ok) { console.error("Transcript meta fetch failed:", metaRaw); return ""; }

  const meta = JSON.parse(metaRaw);
  const downloadUrl = meta.data?.download_url || meta.download_url;
  if (!downloadUrl) { console.error("No download_url in transcript meta:", metaRaw); return ""; }

  const dlRes = await fetch(downloadUrl);
  const dlRaw = await dlRes.text();
  console.log("Transcript download status:", dlRes.status, "sample:", dlRaw.slice(0, 300));
  if (!dlRes.ok) { console.error("Transcript download failed:", dlRes.status); return ""; }

  // Format: array of { participant: { name }, words: [{ text }] }
  try {
    const segments = JSON.parse(dlRaw);
    if (Array.isArray(segments)) {
      return segments
        .map(seg => {
          const speaker = seg.participant?.name || seg.speaker || "Speaker";
          const words = (seg.words || []).map(w => w.text || w.word || "").join(" ").trim();
          return `${speaker}: ${words}`;
        })
        .filter(line => line.length > 10)
        .join("\n\n");
    }
  } catch (e) {
    console.error("Transcript parse error:", e.message);
    return dlRaw;
  }
  return "";
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
    console.log("Anthropic response status:", aiRes.status, "stop_reason:", aiData.stop_reason, "error:", aiData.error);

    if (!aiRes.ok || aiData.error) {
      console.error("Anthropic API error:", JSON.stringify(aiData));
      return;
    }

    const raw = (aiData.content || []).map(b => b.text || "").join("").trim();
    console.log("Raw Claude response length:", raw.length, "preview:", raw.slice(0, 200));

    let brief = null;
    try {
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s === -1 || e === -1) {
        console.error("No JSON object found in Claude response. Raw:", raw.slice(0, 500));
      } else {
        let jsonStr = raw.slice(s, e + 1).replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
        brief = JSON.parse(jsonStr);
        if (!Array.isArray(brief.concepts)) brief.concepts = [];
        if (!brief.clientActionItems) brief.clientActionItems = [];
        if (!brief.internalTodos) brief.internalTodos = [];
      }
    } catch (parseErr) {
      console.error("Brief parse error:", parseErr.message, "raw:", raw.slice(0, 500));
    }

    if (brief) {
      const { error: dbErr } = await supabase.from("projects").update({
        title: brief.projectTitle || "Untitled",
        client_name: brief.clientName || "",
        brief: brief,
        recall_status: "brief_ready",
        updated_at: new Date().toISOString(),
      }).eq("id", projectId);
      if (dbErr) console.error("Supabase brief update error:", dbErr.message);
      else console.log("Brief generated for project:", projectId);
    } else {
      console.error("Brief is null — not saving. Check Claude response above.");
    }
  } catch (err) {
    console.error("generateBrief error:", err.message, err.stack);
  }
}
