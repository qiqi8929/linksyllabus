import { MAGICLOG_TRADES } from "@/lib/magiclog/constants";
import { env } from "@/lib/env";

export type ScannedCoverFields = {
  name: string | null;
  ait_id: string | null;
  trade: string | null;
  start_date: string | null;
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

function matchTrade(extracted: string | null): string | null {
  if (!extracted?.trim()) return null;
  const lower = extracted.toLowerCase();
  for (const t of MAGICLOG_TRADES) {
    if (lower.includes(t.toLowerCase())) return t;
  }
  if (lower.includes("electric")) return "Electrician";
  if (lower.includes("plumb")) return "Plumber";
  if (lower.includes("weld")) return "Welder";
  if (lower.includes("pipe")) return "Pipefitter";
  if (lower.includes("carpent")) return "Carpenter";
  if (lower.includes("heavy equipment")) return "Heavy Equipment Technician";
  return "Other";
}

function normalizeDate(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  if (iso) return iso;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function extractMagicLogCoverFields(
  imageBase64: string,
  mimeType: string
): Promise<ScannedCoverFields> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("AI is not configured (missing GEMINI_API_KEY).");
  }

  const prompt = `Extract the following from this Alberta AIT apprentice record book cover image:
apprentice name, AIT ID number, trade name, apprenticeship start date.

Return ONLY JSON (no markdown):
{"name":"...","ait_id":"...","trade":"...","start_date":"YYYY-MM-DD"}

Use null for any field you cannot read.`;

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
    throw new Error(`Cover scan failed (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = parseJsonObject(raw);

  const tradeRaw = parsed.trade != null ? String(parsed.trade) : null;

  return {
    name: parsed.name != null ? String(parsed.name).trim() || null : null,
    ait_id: parsed.ait_id != null ? String(parsed.ait_id).trim() || null : null,
    trade: matchTrade(tradeRaw),
    start_date: normalizeDate(parsed.start_date)
  };
}
