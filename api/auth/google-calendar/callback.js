// api/auth/google-calendar/callback.js
// Handles the OAuth redirect from Google, exchanges code for tokens,
// connects to Recall.ai Calendar API, and stores in Supabase.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const RECALL_KEY = process.env.RECALL_API_KEY;
const RECALL_REGION = "us-west-2";

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  // Decode state — may be JSON {userId, origin} or legacy plain userId
  let userId, APP_URL;
  try {
    const decoded = Buffer.from(state || "", "base64").toString("utf-8");
    try {
      const parsed = JSON.parse(decoded);
      userId = parsed.userId;
      APP_URL = parsed.origin || "https://framebriefai.com";
    } catch {
      // Legacy format: plain userId string
      userId = decoded;
      APP_URL = "https://framebriefai.com";
    }
    if (!userId || userId.length < 10) throw new Error("invalid");
  } catch {
    return res.redirect(`https://framebriefai.com?calendar_error=invalid_state`);
  }

  if (error) {
    return res.redirect(`${APP_URL}?calendar_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${APP_URL}?calendar_error=invalid_request`);
  }

  try {
    // 1. Exchange authorization code for Google tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    console.log("Google token exchange status:", tokenRes.status, "error:", tokens.error);

    if (!tokenRes.ok || tokens.error) {
      throw new Error(tokens.error_description || tokens.error || "Google token exchange failed");
    }

    // 2. Connect to Recall.ai Calendar API using the OAuth tokens
    const recallRes = await fetch(`https://${RECALL_REGION}.recall.ai/api/v1/calendar/google-oauth/`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${RECALL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        notetaker_preferences: {
          bot_name: "Frame Brief",
          webhook_url: "https://framebriefai.com/api/recall-webhook",
        },
      }),
    });

    const recallData = await recallRes.json();
    console.log("Recall calendar connect status:", recallRes.status, "response:", JSON.stringify(recallData).slice(0, 300));

    // Accept both success and already-connected responses
    const recallCalendarId = recallData.id || recallData.calendar_id || null;

    // 3. Upsert into user_settings
    const { error: dbErr } = await supabase.from("user_settings").upsert({
      id: userId,
      calendar_connected: true,
      google_access_token: tokens.access_token,
      google_refresh_token: tokens.refresh_token || null,
      recall_calendar_id: recallCalendarId,
      updated_at: new Date().toISOString(),
    });

    if (dbErr) {
      console.error("Supabase upsert error:", dbErr.message);
      throw new Error("Failed to save calendar settings");
    }

    console.log("Calendar connected for user:", userId, "recall_calendar_id:", recallCalendarId);
    return res.redirect(`${APP_URL}?calendar_connected=1`);

  } catch (err) {
    console.error("Calendar callback error:", err.message);
    return res.redirect(`${APP_URL}?calendar_error=${encodeURIComponent(err.message)}`);
  }
}
