// api/auth/google-calendar/callback.js
// Exchanges the Google OAuth code for tokens, creates the Recall.ai V2 calendar,
// and saves everything to Supabase.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const RECALL_KEY = process.env.RECALL_API_KEY;
const RECALL_REGION = "us-west-2";

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  // Decode state — base64 JSON {userId, origin}
  let userId, APP_URL;
  try {
    const decoded = Buffer.from(state || "", "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    userId = parsed.userId;
    APP_URL = parsed.origin || "https://framebriefai.com";
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
    console.log("Google token exchange status:", tokenRes.status, "has_refresh:", !!tokens.refresh_token, "error:", tokens.error);

    if (!tokenRes.ok || tokens.error) {
      throw new Error(tokens.error_description || tokens.error || "Google token exchange failed");
    }

    if (!tokens.refresh_token) {
      // This happens when the user has already authorized before — revoke and reconnect
      console.error("No refresh_token returned — user may need to revoke access in Google account settings");
      throw new Error("No refresh token — please revoke Frame Brief's Google Calendar access and try again");
    }

    // 2. Create calendar in Recall.ai V2 (POST tokens directly — no dashboard config needed)
    let recallCalendarId = null;
    try {
      const recallRes = await fetch(`https://${RECALL_REGION}.recall.ai/api/v2/calendars/`, {
        method: "POST",
        headers: {
          "Authorization": `Token ${RECALL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oauth_client_id: process.env.GOOGLE_CLIENT_ID,
          oauth_client_secret: process.env.GOOGLE_CLIENT_SECRET,
          oauth_refresh_token: tokens.refresh_token,
          platform: "google_calendar",
        }),
      });

      const recallRaw = await recallRes.text();
      console.log("Recall V2 calendar create status:", recallRes.status, "response:", recallRaw.slice(0, 400));

      try {
        const recallData = JSON.parse(recallRaw);
        recallCalendarId = recallData.id || null;
        if (!recallCalendarId) console.error("Recall V2 returned no id — full response:", recallRaw.slice(0, 400));
      } catch {
        console.error("Recall V2 response not JSON:", recallRaw.slice(0, 200));
      }
    } catch (recallErr) {
      console.error("Recall V2 calendar create error (non-fatal):", recallErr.message);
    }

    // 3. Save to Supabase — store refresh_token so reconnect-recall can re-create if needed
    const { error: dbErr } = await supabase.from("user_settings").upsert({
      id: userId,
      calendar_connected: true,
      google_refresh_token: tokens.refresh_token,
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
