// api/auth/google-calendar/callback.js
// Proxies the Google OAuth callback to Recall.ai's handler.
// Recall.ai exchanges the code for tokens, creates the calendar connection,
// and redirects to the success_url we embedded in the state param.
const RECALL_REGION = "us-west-2";

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  // Parse state to extract error_url for failure redirects
  let stateData = {};
  let errorUrl = "https://framebriefai.com?calendar_error=oauth_failed";
  try {
    stateData = JSON.parse(state || "{}");
    if (stateData.error_url) errorUrl = stateData.error_url;
  } catch {
    // state wasn't JSON — fall through with defaults
  }

  if (error) {
    console.log("Google OAuth error:", error);
    return res.redirect(`${errorUrl}&detail=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    console.log("Missing code or state in callback");
    return res.redirect(`${errorUrl}&detail=missing_params`);
  }

  // Forward to Recall.ai's callback — it handles the token exchange.
  // Recall.ai reads google_oauth_redirect_url from state to use as redirect_uri
  // when calling Google's token endpoint (must match what we used in the auth URL).
  const recallCallbackUrl = `https://${RECALL_REGION}.recall.ai/api/v1/calendar/google_oauth_callback/`;
  const forwardUrl = `${recallCallbackUrl}?${new URLSearchParams({ code, state })}`;
  console.log("Forwarding to Recall.ai callback:", forwardUrl.slice(0, 120));
  return res.redirect(forwardUrl);
}
