// api/google-calendar-auth.js
// Handles Google Calendar OAuth URL generation, Recall.ai calendar actions,
// and meeting-project link management.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const RECALL_KEY = process.env.RECALL_API_KEY;
const RECALL_REGION = "us-west-2";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, userId } = req.query;

  try {
    // ── Generate Google OAuth URL ────────────────────────────────────────────
    if (action === "oauth-url") {
      if (!userId) return res.status(400).json({ error: "userId required" });

      const referer = req.headers.referer || req.headers.origin || "";
      let origin = "https://framebriefai.com";
      try { if (referer) origin = new URL(referer).origin; } catch {}

      // Step 1: Get a Recall.ai calendar auth token scoped to this user
      const recallAuthRes = await fetch(
        `https://${RECALL_REGION}.recall.ai/api/v1/calendar/authenticate/`,
        {
          method: "POST",
          headers: { "Authorization": `Token ${RECALL_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        }
      );
      const recallAuthRaw = await recallAuthRes.text();
      console.log("Recall authenticate status:", recallAuthRes.status, "response:", recallAuthRaw.slice(0, 300));
      let recallCalendarAuthToken = null;
      try {
        const d = JSON.parse(recallAuthRaw);
        recallCalendarAuthToken = d.token || d.recall_calendar_auth_token || d.access_token || null;
      } catch {
        console.error("Recall authenticate response not JSON:", recallAuthRaw.slice(0, 200));
        return res.status(500).json({ error: "Failed to initialize calendar connection with Recall.ai" });
      }
      if (!recallCalendarAuthToken) {
        return res.status(500).json({ error: "Recall.ai did not return auth token", raw: recallAuthRaw.slice(0, 200) });
      }

      // Step 2: Build Google OAuth URL.
      // Our callback acts as a proxy — it forwards the code to Recall.ai's callback.
      // google_oauth_redirect_url = our registered callback URL (Recall.ai uses it in token exchange)
      const ourCallback = process.env.GOOGLE_REDIRECT_URI;
      const successUrl = `${origin}?calendar_connected=1&userId=${encodeURIComponent(userId)}`;
      const errorUrl = `${origin}?calendar_error=oauth_failed`;

      // State must be plain JSON.stringify (not base64) — Recall.ai parses it directly
      const state = JSON.stringify({
        recall_calendar_auth_token: recallCalendarAuthToken,
        google_oauth_redirect_url: ourCallback,
        success_url: successUrl,
        error_url: errorUrl,
      });

      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: ourCallback,
        response_type: "code",
        scope: [
          "https://www.googleapis.com/auth/calendar.events.readonly",
          "https://www.googleapis.com/auth/userinfo.email",
        ].join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
      });

      const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      return res.status(200).json({ url });
    }

    // ── Fetch upcoming meetings from Recall.ai calendar ──────────────────────
    if (action === "upcoming-meetings") {
      if (!userId) return res.status(400).json({ error: "userId required" });

      const { data: settings } = await supabase
        .from("user_settings")
        .select("recall_calendar_id, calendar_connected, meeting_project_links")
        .eq("id", userId)
        .single();

      if (!settings?.calendar_connected || !settings?.recall_calendar_id) {
        return res.status(200).json({ meetings: [], connected: false });
      }

      const now = new Date().toISOString();
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const meetingsRes = await fetch(
        `https://${RECALL_REGION}.recall.ai/api/v1/calendar/meeting/?` +
          new URLSearchParams({
            calendar_id: settings.recall_calendar_id,
            start_time__gte: now,
            start_time__lte: future,
          }),
        { headers: { Authorization: `Token ${RECALL_KEY}` } }
      );

      if (!meetingsRes.ok) {
        const errText = await meetingsRes.text();
        console.error("Recall meetings fetch failed:", meetingsRes.status, errText.slice(0, 300));
        return res.status(200).json({ meetings: [], connected: true, error: "Failed to fetch meetings" });
      }

      const meetingsData = await meetingsRes.json();
      const rawMeetings = meetingsData.results || meetingsData || [];

      // Auto-schedule bots for any meetings that don't have one yet
      for (const m of rawMeetings) {
        const hasBot = !!(m.bot_id || m.notetaker_id || m.bot);
        const hasMeetingUrl = !!(m.meeting_url);
        if (!hasBot && hasMeetingUrl) {
          const botRes = await fetch(
            `https://${RECALL_REGION}.recall.ai/api/v1/calendar/meeting/${m.id}/bot/`,
            {
              method: "POST",
              headers: { Authorization: `Token ${RECALL_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                bot_name: "Frame Brief",
                webhook_url: "https://framebriefai.com/api/recall-webhook",
              }),
            }
          );
          console.log("Auto-scheduled bot for meeting:", m.id, "status:", botRes.status);
          if (botRes.ok) m.bot_id = (await botRes.json()).id;
        }
      }

      const meetings = rawMeetings.map((m) => ({
        id: m.id,
        title: m.summary || m.title || "Untitled Meeting",
        startTime: m.start_time,
        endTime: m.end_time,
        meetingUrl: m.meeting_url || null,
        attendees: (m.attendees || []).map((a) => a.email || a.name || a),
        linkedProjectId: settings.meeting_project_links?.[m.id] || null,
        botScheduled: !!(m.bot_id || m.notetaker_id || m.bot),
      }));

      return res.status(200).json({ meetings, connected: true });
    }

    // ── Link a meeting to an existing project (follow-up consultations only) ─
    if (action === "link-meeting" && req.method === "POST") {
      const { userId: uid, meetingId, projectId } = req.body || {};
      if (!uid || !meetingId) return res.status(400).json({ error: "userId and meetingId required" });

      const { data: settings } = await supabase
        .from("user_settings")
        .select("meeting_project_links")
        .eq("id", uid)
        .single();

      const links = { ...(settings?.meeting_project_links || {}) };
      if (projectId) {
        links[meetingId] = projectId;
      } else {
        delete links[meetingId];
      }

      const { error: dbErr } = await supabase
        .from("user_settings")
        .upsert({ id: uid, meeting_project_links: links, updated_at: new Date().toISOString() });

      if (dbErr) return res.status(500).json({ error: dbErr.message });
      return res.status(200).json({ ok: true });
    }

    // ── Fetch recall_calendar_id for a user after OAuth completes ────────────
    if (action === "reconnect-recall" && req.method === "POST") {
      const { userId: uid } = req.body || {};
      if (!uid) return res.status(400).json({ error: "userId required" });

      // Get a Recall.ai calendar auth token scoped to this user
      const authRes = await fetch(`https://${RECALL_REGION}.recall.ai/api/v1/calendar/authenticate/`, {
        method: "POST",
        headers: { "Authorization": `Token ${RECALL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid }),
      });
      const authRaw = await authRes.text();
      console.log("reconnect-recall authenticate status:", authRes.status, "response:", authRaw.slice(0, 300));
      let calAuthToken = null;
      try {
        const d = JSON.parse(authRaw);
        calAuthToken = d.token || d.recall_calendar_auth_token || d.access_token || null;
      } catch {
        return res.status(500).json({ error: "recall_auth_failed", raw: authRaw.slice(0, 200) });
      }
      if (!calAuthToken) {
        return res.status(500).json({ error: "no_auth_token", raw: authRaw.slice(0, 200) });
      }

      // List calendars for this user using the scoped token
      const calRes = await fetch(`https://${RECALL_REGION}.recall.ai/api/v1/calendar/`, {
        headers: { "Authorization": `Token ${calAuthToken}` },
      });
      const calRaw = await calRes.text();
      console.log("reconnect-recall calendar list status:", calRes.status, "response:", calRaw.slice(0, 300));
      let recallCalendarId = null;
      try {
        const calData = JSON.parse(calRaw);
        const calendars = calData.results || (Array.isArray(calData) ? calData : []);
        recallCalendarId = calendars[0]?.id || null;
      } catch {
        return res.status(500).json({ error: "calendar_list_failed", status: calRes.status, raw: calRaw.slice(0, 200) });
      }

      if (!recallCalendarId) {
        return res.status(200).json({ ok: false, message: "No calendar found on Recall.ai — please reconnect Google Calendar" });
      }

      const { error: dbErr } = await supabase.from("user_settings").upsert({
        id: uid,
        recall_calendar_id: recallCalendarId,
        updated_at: new Date().toISOString(),
      });
      if (dbErr) return res.status(500).json({ error: dbErr.message });
      console.log("reconnect-recall: saved calendar_id:", recallCalendarId, "for user:", uid);
      return res.status(200).json({ ok: true, recall_calendar_id: recallCalendarId });
    }

    // ── Disconnect Google Calendar ───────────────────────────────────────────
    if (action === "disconnect" && req.method === "POST") {
      const { userId: uid } = req.body || {};
      if (!uid) return res.status(400).json({ error: "userId required" });

      const { data: settings } = await supabase
        .from("user_settings")
        .select("recall_calendar_id")
        .eq("id", uid)
        .single();

      if (settings?.recall_calendar_id) {
        const delRes = await fetch(
          `https://${RECALL_REGION}.recall.ai/api/v1/calendar/${settings.recall_calendar_id}/`,
          {
            method: "DELETE",
            headers: { Authorization: `Token ${RECALL_KEY}` },
          }
        );
        console.log("Recall calendar delete status:", delRes.status);
      }

      const { error: dbErr } = await supabase.from("user_settings").upsert({
        id: uid,
        calendar_connected: false,
        google_access_token: null,
        google_refresh_token: null,
        recall_calendar_id: null,
        meeting_project_links: {},
        updated_at: new Date().toISOString(),
      });

      if (dbErr) return res.status(500).json({ error: dbErr.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("google-calendar-auth error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
