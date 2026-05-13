// api/generate-hooks.js
export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { concept } = req.body || {};
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY;

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "Anthropic key not configured" });

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: "Generate exactly 3 compelling opening hooks for a video/reel. Each hook is one punchy sentence that grabs attention in the first 3 seconds. Vary styles: emotional, curiosity-driven, bold statement, question, cinematic. Return ONLY a JSON array of 3 strings — no other text.",
      messages: [{
        role: "user",
        content: `Concept: ${concept?.title || ""}\nType: ${concept?.type || ""}\nLogline: ${concept?.logline || ""}\nDescription: ${concept?.description || ""}\nMood: ${(concept?.moodKeywords || []).join(", ")}`,
      }],
    }),
  });

  const aiData = await aiRes.json();
  if (!aiRes.ok) return res.status(aiRes.status).json({ error: aiData?.error?.message || JSON.stringify(aiData) });

  const raw = (aiData.content || []).map(b => b.text || "").join("").trim();
  const s = raw.indexOf("["), e = raw.lastIndexOf("]");
  if (s === -1 || e === -1) return res.status(500).json({ error: "Unexpected response format" });

  const hooks = JSON.parse(raw.slice(s, e + 1));
  return res.status(200).json({ hooks });
}
