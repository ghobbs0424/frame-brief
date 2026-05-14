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

      const state = Buffer.from(userId).toString("base64");
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/calendar.readonly",
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
      const meetings = (meetingsData.results || meetingsData || []).map((m) => ({
        id: m.id,
        title: m.summary || m.title || "Untitled Meeting",
        startTime: m.start_time,
        endTime: m.end_time,
        meetingUrl: m.meeting_url || null,
        attendees: (m.attendees || []).map((a) => a.email || a.name || a),
        linkedProjectId: settings.meeting_project_links?.[m.id] || null,
      }));

      return res.status(200).json({ meetings, connected: true });
    }

    // ── Link a meeting to a project ──────────────────────────────────────────
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
