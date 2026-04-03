import { env } from "@/lib/env";
import { extractYouTubeVideoId } from "@/lib/video";

/** Stable successor to deprecated `gemini-2.0-flash-lite` (not available to new users). */
const GEMINI_MODEL = "gemini-2.5-flash-lite";

/** Native YouTube video analysis (Gemini watches the video URL). */
const GEMINI_MODEL_YOUTUBE_VIDEO = "gemini-1.5-pro";

export type StepForGemini = {
  stepName: string;
  videoUrl: string;
  startTime: number;
  endTime: number;
};

/** Normalize model output: trim, strip ``` fences, then parse JSON with a fallback extractor. */
function parseDescriptionsPayload(raw: string): { descriptions: string[] } {
  let s = raw.trim();
  // ```json ... ``` or ``` ... ```
  s = s.replace(/^```(?:json)?\s*\r?\n?/i, "");
  s = s.replace(/\r?\n?```\s*$/i, "");
  s = s.trim();

  const tryParse = (chunk: string) => JSON.parse(chunk) as { descriptions?: unknown };

  try {
    const o = tryParse(s);
    if (Array.isArray(o.descriptions)) {
      return { descriptions: o.descriptions.map((d) => String(d ?? "").trim()) };
    }
  } catch {
    // fall through
  }

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = s.slice(start, end + 1);
    try {
      const o = tryParse(slice);
      if (Array.isArray(o.descriptions)) {
        return { descriptions: o.descriptions.map((d) => String(d ?? "").trim()) };
      }
    } catch {
      // fall through
    }
  }

  throw new Error(
    `Gemini returned non-JSON text: ${raw.length > 280 ? `${raw.slice(0, 280)}…` : raw}`
  );
}

/**
 * Uses Gemini 1.5 Pro native YouTube video understanding for a single step name.
 */
export async function extractVideoTimestamps(
  youtubeUrl: string,
  stepName: string
): Promise<{ start_time: number; end_time: number }> {
  const name = stepName.trim();
  if (!name) {
    throw new Error("Step name is required for timestamp detection.");
  }

  const rows = await extractTimestampsForStepsFromYouTubeVideo(youtubeUrl, [name]);
  const row = rows.find((r) => r.stepName === name) ?? rows[0];
  if (!row) {
    throw new Error("Could not determine timestamps for this step.");
  }
  return { start_time: row.start_time, end_time: row.end_time };
}

export type StepTimestampFromVideo = {
  stepName: string;
  start_time: number;
  end_time: number;
};

function parseVideoStepTimestampsArray(raw: string): StepTimestampFromVideo[] {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*\r?\n?/i, "");
  s = s.replace(/\r?\n?```\s*$/i, "");
  s = s.trim();

  const coerceItem = (o: Record<string, unknown>): StepTimestampFromVideo | null => {
    const stepName = String(o?.stepName ?? "").trim();
    const startSec = o?.start_time_seconds ?? o?.start_time;
    const endSec = o?.end_time_seconds ?? o?.end_time;
    const start_time = Math.floor(Number(startSec));
    const end_time = Math.floor(Number(endSec));
    if (!stepName || !Number.isFinite(start_time) || !Number.isFinite(end_time)) return null;
    if (end_time <= start_time) return null;
    return { stepName, start_time, end_time };
  };

  const parseArray = (chunk: string): StepTimestampFromVideo[] => {
    const arr = JSON.parse(chunk) as unknown;
    if (!Array.isArray(arr)) throw new Error("Expected JSON array");
    const out: StepTimestampFromVideo[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const row = coerceItem(item as Record<string, unknown>);
      if (row) out.push(row);
    }
    return out.sort((a, b) => a.start_time - b.start_time);
  };

  try {
    return parseArray(s);
  } catch {
    // fall through
  }

  const lb = s.indexOf("[");
  const rb = s.lastIndexOf("]");
  if (lb >= 0 && rb > lb) {
    try {
      return parseArray(s.slice(lb, rb + 1));
    } catch {
      // fall through
    }
  }

  throw new Error(
    `Gemini returned non-JSON array: ${raw.length > 280 ? `${raw.slice(0, 280)}…` : raw}`
  );
}

async function generateContentYouTubeVideo(
  youtubeUrl: string,
  textPrompt: string,
  temperature: number
): Promise<string> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL_YOUTUBE_VIDEO}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              fileData: {
                mimeType: "video/youtube",
                fileUri: youtubeUrl.trim()
              }
            },
            { text: textPrompt }
          ]
        }
      ],
      generationConfig: {
        temperature
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini request failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Empty response from Gemini");
  }
  return text;
}

/**
 * Watches the YouTube video via Gemini native video understanding and returns
 * start/end seconds for each named step.
 */
export async function extractTimestampsForStepsFromYouTubeVideo(
  youtubeUrl: string,
  stepNames: string[]
): Promise<StepTimestampFromVideo[]> {
  const urlTrim = youtubeUrl.trim();
  if (!extractYouTubeVideoId(urlTrim)) {
    throw new Error("A valid YouTube URL is required.");
  }

  const names = stepNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    throw new Error("Add at least one step name before extracting timestamps.");
  }

  const list = names.map((n) => `- ${n}`).join("\n");

  const prompt = `Watch this video and identify the timestamps for each of these steps:

${list}

Return JSON only, no markdown, no backticks, as a JSON array with one object per step, in the same order as listed above:
[{"stepName":"<exact step name>","start_time_seconds":0,"end_time_seconds":60},...]

Use whole seconds from the start of the video. Each end_time_seconds must be greater than start_time_seconds.`;

  const text = await generateContentYouTubeVideo(urlTrim, prompt, 0.2);
  return parseVideoStepTimestampsArray(text);
}

/**
 * Returns one English description per step (same order as input).
 */
export async function generateStepDescriptions(
  tutorialName: string,
  steps: StepForGemini[]
): Promise<string[]> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  if (steps.length === 0) return [];

  const lines = steps.map(
    (s, i) =>
      `${i + 1}. Name: ${s.stepName}\n   Video: ${s.videoUrl}\n   Clip: ${s.startTime}s–${s.endTime}s`
  );

  const prompt = `You are writing short instructional blurbs for a multi-step video tutorial.

Tutorial title: "${tutorialName}"

For each numbered step below, write ONE concise English description (2–4 sentences) explaining what the learner should focus on or do in that segment, based on the step name and context. Do not repeat the title verbatim in every step.

Steps:
${lines.join("\n\n")}

Respond only with valid JSON, no markdown, no backticks. Use this exact shape:
{"descriptions":["...","...",...]}
There must be exactly ${steps.length} strings in "descriptions", in the same order as the steps.`;

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini request failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Empty response from Gemini");
  }

  const parsed = parseDescriptionsPayload(text);
  const descriptions = parsed.descriptions;
  if (!Array.isArray(descriptions) || descriptions.length !== steps.length) {
    throw new Error(
      `Expected ${steps.length} descriptions, got ${descriptions?.length ?? 0}`
    );
  }

  return descriptions.map((d) => String(d ?? "").trim());
}
