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
          webhook_url: `https://framebriefai.com/api/recall-webhook`,
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

      // First check if transcript is already saved in the project
      const { data: existingProject } = await supabase.from("projects").select("recall_transcript").eq("id", projectId).single();
      let text = existingProject?.recall_transcript || "";
      console.log("fetch-transcript: existing transcript length:", text.length);

      // Only call Recall.ai if we don't already have the transcript
      if (!text.trim()) {
        const botRes = await fetch(
          `https://${RECALL_REGION}.recall.ai/api/v1/bot/${botId}/`,
          { headers: { "Authorization": `Token ${RECALL_KEY}` } }
        );
        const botData = await botRes.json();
        const transcriptId = botData.recordings?.[0]?.media_shortcuts?.transcript?.id;
        console.log("fetch-transcript: transcriptId from Recall:", transcriptId);

        if (!transcriptId) {
          return res.status(200).json({ ok: false, message: "No transcript found on bot" });
        }

        text = await downloadAndParseTranscript(transcriptId);
        if (!text.trim()) {
          return res.status(200).json({ ok: false, message: "Transcript empty or not ready" });
        }

        await supabase.from("projects").update({
          recall_status: "transcript_ready",
          recall_transcript: text,
          updated_at: new Date().toISOString(),
        }).eq("id", projectId);
      }

      await generateBrief(projectId, text);
      return res.status(200).json({ ok: true, transcriptLength: text.length });
    }

    // ── Receive Recall webhook ───────────────────────────────────────────────
    const event = req.body;
    const eventName = event && event.event;
    // Log full payload every time so we can see exact structure from Recall
    console.log("Webhook event:", eventName, "full payload:", JSON.stringify(event));

    // ── V2 calendar sync: auto-schedule bots for new/updated events ─────────
    if (eventName === "calendar.sync_events" || eventName === "calendar.update") {
      const calendarId = event.data?.calendar_id;
      const lastUpdatedTs = event.data?.last_updated_ts;
      console.log("Calendar sync event — calendarId:", calendarId, "lastUpdatedTs:", lastUpdatedTs);
      if (!calendarId) return res.status(200).json({ ok: true });

      // Find which user owns this calendar
      const { data: settings } = await supabase
        .from("user_settings")
        .select("id, meeting_project_links")
        .eq("recall_calendar_id", calendarId)
        .single();

      if (!settings) {
        console.log("calendar sync: no user found for calendar:", calendarId);
        return res.status(200).json({ ok: true });
      }

      // Fetch events updated since last sync (or next 7 days if no ts)
      const queryParams = new URLSearchParams({ calendar_id: calendarId });
      if (lastUpdatedTs) {
        queryParams.set("updated_at__gte", lastUpdatedTs);
      } else {
        queryParams.set("start_time__gte", new Date().toISOString());
        queryParams.set("start_time__lte", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
      }

      const eventsRes = await fetch(
        `https://${RECALL_REGION}.recall.ai/api/v2/calendar-events/?${queryParams}`,
        { headers: { Authorization: `Token ${RECALL_KEY}` } }
      );

      if (!eventsRes.ok) {
        console.error("calendar sync: events fetch failed:", eventsRes.status);
        return res.status(200).json({ ok: true });
      }

      const eventsData = await eventsRes.json();
      const events = eventsData.results || [];
      console.log("calendar sync: fetched", events.length, "events for calendar:", calendarId);

      const now = new Date();
      for (const evt of events) {
        if (evt.is_deleted || !evt.meeting_url) continue;
        const startTime = new Date(evt.start_time);
        if (startTime <= now) continue; // already started or past
        const hasBot = !!(evt.bot || evt.bot_id || evt.scheduled_bot);
        if (hasBot) continue;

        const linkedProjectId = settings.meeting_project_links?.[evt.id] || null;
        const botRes = await fetch(
          `https://${RECALL_REGION}.recall.ai/api/v2/calendar-events/${evt.id}/bot/`,
          {
            method: "POST",
            headers: { Authorization: `Token ${RECALL_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              deduplication_key: `framebrief-${evt.id}`,
              bot_config: {
                bot_name: "Frame Brief",
                webhook_url: "https://framebriefai.com/api/recall-webhook",
              },
            }),
          }
        );
        const botRaw = await botRes.text();
        console.log("calendar sync: scheduled bot for event:", evt.id, "status:", botRes.status, "linked_project:", linkedProjectId, "response:", botRaw.slice(0, 200));
      }

      return res.status(200).json({ ok: true, calendarSync: true });
    }

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

    // ── Calendar bot: no project found → try to auto-create from calendar event ─
    if (!project) {
      let resolvedProject = await resolveCalendarBotProject(botId);
      if (!resolvedProject) {
        return res.status(200).json({ ok: true, error: "project not found for bot " + botId });
      }
      // Continue processing with the resolved/created project
      Object.assign(event, {}); // keep flow going
      const botProject = resolvedProject;

      if (transcriptionTriggerEvents.includes(eventName)) {
        let recordingId = recordingIdFromEvent;
        if (!recordingId) {
          const botRes = await fetch(`https://${RECALL_REGION}.recall.ai/api/v1/bot/${botId}/`, { headers: { "Authorization": `Token ${RECALL_KEY}` } });
          if (botRes.ok) {
            const botData = await botRes.json();
            recordingId = (botData.recordings && botData.recordings[0] && botData.recordings[0].id) || (botData.recording && botData.recording.id);
          }
        }
        if (recordingId) {
          const asyncUrl = `https://${RECALL_REGION}.recall.ai/api/v1/recording/${recordingId}/create_transcript/`;
          const asyncRes = await fetch(asyncUrl, {
            method: "POST",
            headers: { "Authorization": `Token ${RECALL_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ provider: { recallai_async: { language_code: "en" } } }),
          });
          console.log("Calendar bot async transcription trigger:", asyncRes.status);
          await supabase.from("projects").update({ recall_status: "transcribing", updated_at: new Date().toISOString() }).eq("id", botProject.id);
        }
        return res.status(200).json({ ok: true, calendarBot: true });
      }

      if (eventName === "transcript.done" && transcriptId) {
        const text = await downloadAndParseTranscript(transcriptId);
        await supabase.from("projects").update({
          recall_status: text.trim() ? "transcript_ready" : "empty_transcript",
          recall_transcript: text || null,
          updated_at: new Date().toISOString(),
        }).eq("id", botProject.id);
        if (text.trim()) await generateBrief(botProject.id, text);
      }

      return res.status(200).json({ ok: true, calendarBot: true });
    }

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

async function resolveCalendarBotProject(botId) {
  try {
    // Fetch bot details from Recall.ai to get calendar metadata
    const botRes = await fetch(
      `https://${RECALL_REGION}.recall.ai/api/v1/bot/${botId}/`,
      { headers: { "Authorization": `Token ${RECALL_KEY}` } }
    );
    if (!botRes.ok) { console.error("resolveCalendarBotProject: bot fetch failed:", botRes.status); return null; }

    const botData = await botRes.json();
    const calendarMeetingId = botData.calendar_meetings?.[0]?.id || botData.calendar_meeting?.id || null;
    const meetingTitle = botData.calendar_meetings?.[0]?.raw?.summary || botData.meeting_metadata?.title || "Calendar Meeting";
    console.log("resolveCalendarBotProject — calendarMeetingId:", calendarMeetingId, "title:", meetingTitle);

    // Find the user who owns this calendar by checking recall_calendar_id in user_settings
    const calendarId = botData.calendar_meetings?.[0]?.calendar_id || botData.calendar_id || null;
    if (!calendarId) { console.error("resolveCalendarBotProject: no calendar_id on bot"); return null; }

    const { data: settings } = await supabase
      .from("user_settings")
      .select("id, meeting_project_links")
      .eq("recall_calendar_id", calendarId)
      .single();

    if (!settings) { console.error("resolveCalendarBotProject: no user found for calendar:", calendarId); return null; }

    const userId = settings.id;

    // Check if this meeting is already linked to a project
    const linkedProjectId = calendarMeetingId ? settings.meeting_project_links?.[calendarMeetingId] : null;
    if (linkedProjectId) {
      const { data: linked } = await supabase.from("projects").select("*").eq("id", linkedProjectId).single();
      if (linked) {
        // Update bot id on the existing project
        await supabase.from("projects").update({ recall_bot_id: botId, recall_status: "bot_joined", updated_at: new Date().toISOString() }).eq("id", linkedProjectId);
        console.log("resolveCalendarBotProject: linked to existing project:", linkedProjectId);
        return { ...linked, recall_bot_id: botId };
      }
    }

    // No existing project — create one automatically
    const { data: newProject, error: createErr } = await supabase.from("projects").insert({
      user_id: userId,
      title: meetingTitle,
      status: "Draft",
      brief: {},
      recall_bot_id: botId,
      recall_status: "bot_joined",
    }).select().single();

    if (createErr) { console.error("resolveCalendarBotProject: project create failed:", createErr.message); return null; }
    console.log("resolveCalendarBotProject: auto-created project:", newProject.id, "for user:", userId);
    return newProject;
  } catch (err) {
    console.error("resolveCalendarBotProject error:", err.message);
    return null;
  }
}

async function generateBrief(projectId, transcriptText) {
  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY;
    console.log("generateBrief — ANTHROPIC_KEY present:", !!ANTHROPIC_KEY, "key prefix:", ANTHROPIC_KEY ? ANTHROPIC_KEY.slice(0, 7) : "MISSING", "projectId:", projectId, "transcriptLength:", transcriptText?.length);
    if (!ANTHROPIC_KEY) {
      console.error("generateBrief ABORT — no Anthropic key found in env (tried ANTHROPIC_KEY and VITE_ANTHROPIC_KEY)");
      await supabase.from("projects").update({ recall_status: "brief_error", updated_at: new Date().toISOString() }).eq("id", projectId);
      return;
    }

    // Fetch full project to determine if it has an existing brief
    const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).single();
    const hasExistingBrief = project && Array.isArray(project.brief?.concepts) && project.brief.concepts.length > 0;

    console.log("generateBrief — hasExistingBrief:", hasExistingBrief, "conceptCount:", project?.brief?.concepts?.length);

    if (hasExistingBrief) {
      // ── Consultation flow: detect stage, summarize, suggest changes ──────────
      const CONSULTATION_SYSTEM = `You are a creative director AI reviewing a follow-up meeting for an ongoing production project. Analyze the transcript and return ONLY valid JSON, no markdown:
{"stage":"discovery|consultation|shoot_day|post_production","summary":"2-3 sentence summary of what was discussed","keyPoints":["key point 1","key point 2","key point 3"],"suggestedChanges":[{"field":"fieldName","description":"What to change and why","before":"current value (quote from brief if possible)","after":"suggested new value"}]}
stage: pick the best fit — discovery (first call), consultation (follow-up/revision), shoot_day (day-of or prep), post_production (editing/delivery).
suggestedChanges: list specific, actionable changes to the existing brief fields. Reference actual field names from the brief. Limit to the most important 3-6 changes.`;

      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 3000,
          system: CONSULTATION_SYSTEM,
          messages: [{ role: "user", content: `Existing brief:\n${JSON.stringify(project.brief)}\n\nMeeting transcript:\n${transcriptText}` }],
        }),
      });

      const aiData = await aiRes.json();
      console.log("Consultation AI status:", aiRes.status, "stop_reason:", aiData.stop_reason);

      if (!aiRes.ok || aiData.error) {
        console.error("Anthropic consultation error:", JSON.stringify(aiData));
        await supabase.from("projects").update({ recall_status: "brief_error", updated_at: new Date().toISOString() }).eq("id", projectId);
        return;
      }

      const raw = (aiData.content || []).map(b => b.text || "").join("").trim();
      console.log("Consultation raw length:", raw.length, "preview:", raw.slice(0, 200));

      let parsed = null;
      try {
        const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
        if (s !== -1 && e !== -1) parsed = JSON.parse(raw.slice(s, e + 1).replace(/,\s*}/g, "}").replace(/,\s*]/g, "]"));
      } catch (pe) { console.error("Consultation parse error:", pe.message); }

      if (!parsed) {
        await supabase.from("projects").update({ recall_status: "brief_error", updated_at: new Date().toISOString() }).eq("id", projectId);
        return;
      }

      const meeting = {
        id: `m-${Date.now()}`,
        date: new Date().toISOString(),
        stage: parsed.stage || "consultation",
        summary: parsed.summary || "",
        keyPoints: parsed.keyPoints || [],
        suggestedChanges: parsed.suggestedChanges || [],
        transcriptExcerpt: transcriptText.slice(0, 500),
        status: "pending_review",
      };

      const existingHistory = Array.isArray(project.meeting_history) ? project.meeting_history : [];
      const newHistory = [...existingHistory, meeting];

      const { error: dbErr } = await supabase.from("projects").update({
        meeting_stage: parsed.stage || "consultation",
        meeting_history: newHistory,
        recall_status: "brief_pending_review",
        recall_transcript: transcriptText,
        updated_at: new Date().toISOString(),
      }).eq("id", projectId);

      if (dbErr) {
        console.error("Supabase consultation update error:", dbErr.message, "— retrying without lifecycle columns");
        // Fall back: just mark as transcript_ready so user can review manually
        const { error: fallbackErr } = await supabase.from("projects").update({
          recall_status: "transcript_ready",
          recall_transcript: transcriptText,
          updated_at: new Date().toISOString(),
        }).eq("id", projectId);
        if (fallbackErr) console.error("Fallback consultation update failed:", fallbackErr.message);
      } else {
        console.log("Consultation meeting stored for project:", projectId, "stage:", parsed.stage);
      }
      return;
    }

    // ── Discovery flow: generate full brief ───────────────────────────────────
    const SYSTEM = `You are a creative director AI for a video and photography production company. Analyze meeting notes and return ONLY a valid JSON object with no markdown or backticks. For each concept, generate 3-5 compelling opening hooks in the "hooks" array — each hook is a single punchy sentence that grabs attention in the first 3 seconds, varying styles: emotional, curiosity-driven, bold statement, question, cinematic. Return this structure: {"coverEmoji":"🎬","projectTitle":"","clientName":"","projectType":"","date":"","timeline":"","budget":"","logline":"","overview":"","moodKeywords":[],"moodDescription":"","references":[],"overallLocations":[],"overallWardrobe":[],"overallProps":[],"generalNotes":"","clientActionItems":[{"id":"ca-1","text":"","done":false}],"internalTodos":[{"id":"it-1","text":"","done":false}],"concepts":[{"id":"concept-1","emoji":"🎥","title":"","type":"","logline":"","description":"","moodKeywords":[],"inspiration":[],"locations":[],"lighting":{"style":"","description":"","technical":""},"colorHex":["#c8a97e","#3d2b1f","#f5ede0"],"colorDescription":"","wardrobe":[],"wardrobeNotes":"","props":[],"shotList":[{"number":"01","type":"","description":"","lens":"","notes":""}],"script":{"hook":"","act1":"","act2":"","act3":"","cta":""},"deliverableFormat":"","directorNotes":"","hooks":["","",""],"selectedHook":""}]}`;

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
      const meetingRecord = {
        id: `m-${Date.now()}`,
        date: new Date().toISOString(),
        stage: "discovery",
        summary: brief.logline || "Initial discovery meeting — brief generated.",
        keyPoints: [],
        suggestedChanges: [],
        transcriptExcerpt: transcriptText.slice(0, 500),
        status: "reviewed",
      };
      const existingHistory = Array.isArray(project?.meeting_history) ? project.meeting_history : [];

      // Try with new lifecycle columns first; fall back to core-only if columns don't exist yet
      const { error: dbErr } = await supabase.from("projects").update({
        title: brief.projectTitle || "Untitled",
        client_name: brief.clientName || "",
        brief: brief,
        meeting_stage: "discovery",
        meeting_history: [...existingHistory, meetingRecord],
        recall_status: "brief_ready",
        updated_at: new Date().toISOString(),
      }).eq("id", projectId);

      if (dbErr) {
        console.error("Supabase brief update error:", dbErr.message, "— retrying without lifecycle columns");
        const { error: fallbackErr } = await supabase.from("projects").update({
          title: brief.projectTitle || "Untitled",
          client_name: brief.clientName || "",
          brief: brief,
          recall_status: "brief_ready",
          updated_at: new Date().toISOString(),
        }).eq("id", projectId);
        if (fallbackErr) console.error("Fallback update also failed:", fallbackErr.message);
        else console.log("Brief generated (without lifecycle columns) for project:", projectId);
      } else {
        console.log("Brief generated for project:", projectId);
      }
    } else {
      console.error("Brief is null — not saving. Check Claude response above.");
    }
  } catch (err) {
    console.error("generateBrief error:", err.message, err.stack);
  }
}
