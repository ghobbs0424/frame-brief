// api/invite.js — invite a collaborator to a project
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── Remove member ────────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { memberId, requesterId, projectId } = req.body || {};
    if (!memberId || !requesterId || !projectId) return res.status(400).json({ error: "Missing fields" });
    // Verify requester owns the project
    const { data: proj } = await supabase.from("projects").select("user_id").eq("id", projectId).single();
    if (!proj || proj.user_id !== requesterId) return res.status(403).json({ error: "Not project owner" });
    const { error } = await supabase.from("project_members").delete().eq("id", memberId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { projectId, invitedEmail, role, invitedBy, projectTitle } = req.body || {};
  if (!projectId || !invitedEmail || !role || !invitedBy) return res.status(400).json({ error: "Missing fields" });

  // Verify requester owns the project
  const { data: proj } = await supabase.from("projects").select("user_id, title").eq("id", projectId).single();
  if (!proj || proj.user_id !== invitedBy) return res.status(403).json({ error: "Not project owner" });

  // Check if already invited
  const { data: existing } = await supabase.from("project_members")
    .select("id").eq("project_id", projectId).eq("invited_email", invitedEmail).single();
  if (existing) return res.status(409).json({ error: "Already invited" });

  // Look up user_id for this email if they already have an account
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const existingUser = users?.find(u => u.email === invitedEmail);

  // Insert member row
  const { data: member, error: insertErr } = await supabase.from("project_members").insert({
    project_id: projectId,
    invited_email: invitedEmail,
    user_id: existingUser?.id || null,
    role,
    invited_by: invitedBy,
  }).select().single();

  if (insertErr) return res.status(500).json({ error: insertErr.message });

  // Send invite email via Supabase Auth (magic link / invite)
  const projectUrl = `https://frame-brief.vercel.app/share/${projectId}`;
  try {
    if (existingUser) {
      // Existing user — send magic link to the project
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: invitedEmail,
        options: { redirectTo: projectUrl },
      });
    } else {
      // New user — send signup invite
      await supabase.auth.admin.inviteUserByEmail(invitedEmail, {
        redirectTo: projectUrl,
        data: { invited_to_project: projectId },
      });
    }
  } catch (emailErr) {
    console.error("Email send failed (non-fatal):", emailErr.message);
    // Non-fatal — member row was created, just email failed
  }

  return res.status(200).json({ ok: true, member });
}
