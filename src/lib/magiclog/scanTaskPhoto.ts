import { env } from "@/lib/env";

export type ScannedTaskFields = {
  taskName: string | null;
};

function parseJsonObject(raw: string): Record<string, unknown> {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*\r?\n?/i, "");
  s = s.replace(/\r?\n?```\s*$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s) as Record<string, unknown>;
}

export async function extractMagicLogTaskFromPhoto(
  imageBase64: string,
  mimeType: string
): Promise<ScannedTaskFields> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("AI is not configured (missing GEMINI_API_KEY).");
  }

  const prompt = `You are helping a Canadian trades apprentice log work for their record book.

Look at this photo of work on a job site, tools, materials, or a handwritten note.

Identify the single most likely task or competence they were working on today.

Return ONLY JSON (no markdown):
{"taskName":"Short task title in plain English"}

Use null for taskName if you cannot tell. Keep taskName under 120 characters.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel()}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: prompt }
          ]
        }
      ],
      generationConfig: { temperature: 0.1 }
    })
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Task scan failed (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = parseJsonObject(raw);
  const taskName =
    parsed.taskName != null ? String(parsed.taskName).trim().slice(0, 120) || null : null;

  return { taskName };
}
