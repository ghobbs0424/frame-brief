// api/google-calendar-auth.js
// Handles Google Calendar OAuth URL generation and Recall.ai V2 calendar actions.
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

      // State is base64 JSON — our callback decodes it to get userId + origin
      const state = Buffer.from(JSON.stringify({ userId, origin })).toString("base64");

      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: [
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/userinfo.email",
        ].join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
      });

      const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      return res.status(200).json({ url });
    }

    // ── Debug: dump raw Recall.ai calendar events ────────────────────────────
    if (action === "debug-events") {
      if (!userId) return res.status(400).json({ error: "userId required" });
      const { data: settings } = await supabase.from("user_settings").select("recall_calendar_id,calendar_connected").eq("id", userId).single();
      if (!settings?.recall_calendar_id) return res.status(200).json({ error: "no calendar", settings });
      const eventsRes = await fetch(
        `https://${RECALL_REGION}.recall.ai/api/v2/calendar-events/?calendar_id=${settings.recall_calendar_id}`,
        { headers: { Authorization: `Token ${RECALL_KEY}` } }
      );
      const raw = await eventsRes.text();
      console.log("debug-events status:", eventsRes.status, "raw:", raw.slice(0, 1000));
      return res.status(200).json({ status: eventsRes.status, recall_calendar_id: settings.recall_calendar_id, raw: JSON.parse(raw) });
    }

    // ── Fetch upcoming events from Recall.ai V2 ──────────────────────────────
    if (action === "upcoming-meetings") {
      if (!userId) return res.status(400).json({ error: "userId required" });
      // Prevent caching — meetings change frequently
      res.setHeader("Cache-Control", "no-store");

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

      const eventsRes = await fetch(
        `https://${RECALL_REGION}.recall.ai/api/v2/calendar-events/?` +
          new URLSearchParams({
            calendar_id: settings.recall_calendar_id,
            start_time__gte: now,
            start_time__lte: future,
          }),
        { headers: { Authorization: `Token ${RECALL_KEY}` } }
      );

      if (!eventsRes.ok) {
        const errText = await eventsRes.text();
        console.error("Recall V2 calendar-events fetch failed:", eventsRes.status, errText.slice(0, 300));
        return res.status(200).json({ meetings: [], connected: true, error: "Failed to fetch meetings" });
      }

      const eventsData = await eventsRes.json();
      const rawEvents = eventsData.results || eventsData || [];

      // Schedule or immediately trigger bots
      for (const m of rawEvents) {
        const hasBot = (m.bots?.length > 0) || !!(m.bot || m.bot_id || m.scheduled_bot);
        const hasMeetingUrl = !!(m.meeting_url);
        if (!hasBot && hasMeetingUrl) {
          const alreadyStarted = new Date(m.start_time) <= new Date();
          // Resolve linked project: check Recall.ai event ID first, then Google Calendar event ID
          const googleCalendarEventId = m.raw?.id || null;
          const linkedProjectId =
            settings.meeting_project_links?.[m.id] ||
            (googleCalendarEventId ? settings.meeting_project_links?.[googleCalendarEventId] : null) ||
            null;
          // If linked via Google Calendar ID but not Recall ID, save the Recall ID link too
          if (linkedProjectId && googleCalendarEventId && !settings.meeting_project_links?.[m.id]) {
            const updatedLinks = { ...(settings.meeting_project_links || {}), [m.id]: linkedProjectId };
            await supabase.from("user_settings").update({ meeting_project_links: updatedLinks, updated_at: new Date().toISOString() }).eq("id", userId);
            settings.meeting_project_links = updatedLinks;
          }
          const body = {
            bot_config: {
              bot_name: "Frame Brief",
              webhook_url: "https://framebriefai.com/api/recall-webhook",
              metadata: {
                calendar_event_id: m.id,
                user_id: userId,
                event_title: m.raw?.summary || "Calendar Meeting",
                ...(linkedProjectId ? { project_id: linkedProjectId } : {}),
              },
              automatic_leave: {
                waiting_room_timeout: 3600,
                everyone_left_timeout: 60,
              },
            },
          };
          // If meeting already started (user joined early), send bot in now without
          // deduplication so it joins immediately rather than at the old scheduled time
          if (alreadyStarted) {
            body.join_at = new Date().toISOString();
          } else {
            body.deduplication_key = `framebrief-${m.id}`;
          }
          const botRes = await fetch(
            `https://${RECALL_REGION}.recall.ai/api/v2/calendar-events/${m.id}/bot/`,
            {
              method: "POST",
              headers: { Authorization: `Token ${RECALL_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          );
          const botRaw = await botRes.text();
          console.log("Bot", alreadyStarted ? "immediate" : "scheduled", "for event:", m.id, "status:", botRes.status, "response:", botRaw.slice(0, 200));
          try { if (botRes.ok) m._scheduledBot = JSON.parse(botRaw); } catch {}
        }
      }

      const meetings = rawEvents
        .filter((m) => !!m.meeting_url)
        .map((m) => ({
          id: m.id,
          title: m.raw?.summary || m.summary || m.title || "Untitled Meeting",
          startTime: m.start_time,
          endTime: m.end_time,
          meetingUrl: m.meeting_url,
          attendees: (m.raw?.attendees || m.attendees || []).map((a) => a.email || a.name || a),
          linkedProjectId: settings.meeting_project_links?.[m.id] || null,
          botScheduled: (m.bots?.length > 0) || !!(m._scheduledBot || m.bot || m.bot_id || m.scheduled_bot),
        }));

      return res.status(200).json({ meetings, connected: true });
    }

    // ── Link a meeting to an existing project (follow-up consultations) ────────
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

    // ── Re-create Recall.ai V2 calendar using stored refresh token ───────────
    if (action === "reconnect-recall" && req.method === "POST") {
      const { userId: uid } = req.body || {};
      if (!uid) return res.status(400).json({ error: "userId required" });

      const { data: settings } = await supabase
        .from("user_settings")
        .select("google_refresh_token")
        .eq("id", uid)
        .single();

      if (!settings?.google_refresh_token) {
        return res.status(400).json({ error: "no_tokens", message: "No stored Google tokens — please reconnect Google Calendar" });
      }

      const recallRes = await fetch(`https://${RECALL_REGION}.recall.ai/api/v2/calendars/`, {
        method: "POST",
        headers: { "Authorization": `Token ${RECALL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          oauth_client_id: process.env.GOOGLE_CLIENT_ID,
          oauth_client_secret: process.env.GOOGLE_CLIENT_SECRET,
          oauth_refresh_token: settings.google_refresh_token,
          platform: "google_calendar",
        }),
      });

      const recallRaw = await recallRes.text();
      console.log("reconnect-recall V2 status:", recallRes.status, "response:", recallRaw.slice(0, 400));

      let recallCalendarId = null;
      try {
        const recallData = JSON.parse(recallRaw);
        recallCalendarId = recallData.id || null;
      } catch {
        return res.status(500).json({ error: "recall_error", status: recallRes.status, raw: recallRaw.slice(0, 200) });
      }

      if (!recallCalendarId) {
        return res.status(500).json({ error: "no_calendar_id", status: recallRes.status, raw: recallRaw.slice(0, 200) });
      }

      const { error: dbErr } = await supabase.from("user_settings").upsert({
        id: uid,
        recall_calendar_id: recallCalendarId,
        updated_at: new Date().toISOString(),
      });

      if (dbErr) return res.status(500).json({ error: dbErr.message });
      console.log("reconnect-recall: saved V2 calendar_id:", recallCalendarId, "for user:", uid);
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
          `https://${RECALL_REGION}.recall.ai/api/v2/calendars/${settings.recall_calendar_id}/`,
          {
            method: "DELETE",
            headers: { Authorization: `Token ${RECALL_KEY}` },
          }
        );
        console.log("Recall V2 calendar delete status:", delRes.status);
      }

      const { error: dbErr } = await supabase.from("user_settings").upsert({
        id: uid,
        calendar_connected: false,
        google_refresh_token: null,
        recall_calendar_id: null,
        meeting_project_links: {},
        updated_at: new Date().toISOString(),
      });

      if (dbErr) return res.status(500).json({ error: dbErr.message });
      return res.status(200).json({ ok: true });
    }

    // ── Create a Google Calendar event with Meet link ────────────────────────
    if (action === "create-calendar-event" && req.method === "POST") {
      const { userId: uid, title, dateTime, durationMinutes, attendeeEmail } = req.body || {};
      if (!uid || !title || !dateTime) return res.status(400).json({ error: "userId, title, dateTime required" });

      // 1. Look up refresh token
      const { data: settings } = await supabase
        .from("user_settings")
        .select("google_refresh_token")
        .eq("id", uid)
        .single();
      if (!settings?.google_refresh_token) return res.status(400).json({ error: "No Google refresh token found. Reconnect Google Calendar." });

      // 2. Exchange refresh token for access token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: settings.google_refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        return res.status(500).json({ error: tokenData.error_description || "Failed to get access token" });
      }
      const accessToken = tokenData.access_token;

      // 3. Compute end time
      const startDt = new Date(dateTime);
      const endDt = new Date(startDt.getTime() + (parseInt(durationMinutes) || 60) * 60000);
      const endTime = endDt.toISOString();

      // 4. Create calendar event
      const eventRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: title,
            start: { dateTime, timeZone: "America/Chicago" },
            end: { dateTime: endTime, timeZone: "America/Chicago" },
            attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
            conferenceData: {
              createRequest: {
                requestId: `framebrief-${Date.now()}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
            reminders: { useDefault: true },
          }),
        }
      );
      const eventData = await eventRes.json();
      if (!eventRes.ok) {
        return res.status(eventRes.status).json({ error: eventData.error?.message || "Failed to create calendar event" });
      }
      return res.status(200).json({ ok: true, meetingUrl: eventData.hangoutLink || null, eventId: eventData.id });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("google-calendar-auth error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
