import { env } from "@/lib/env";
import { extractYouTubeVideoId } from "@/lib/video";

/** Stable successor to deprecated `gemini-2.0-flash-lite` (not available to new users). */
const GEMINI_MODEL = "gemini-2.5-flash-lite";

/** Video understanding (YouTube URL) — use a model that supports multimodal video. */
const GEMINI_MODEL_VIDEO = "gemini-2.5-flash";

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

function parseTimestampsPayload(raw: string): { start_time: number; end_time: number } {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*\r?\n?/i, "");
  s = s.replace(/\r?\n?```\s*$/i, "");
  s = s.trim();

  const tryParse = (chunk: string) =>
    JSON.parse(chunk) as { start_time?: unknown; end_time?: unknown };

  const coerce = (o: { start_time?: unknown; end_time?: unknown }) => {
    const start_time = Math.floor(Number(o.start_time));
    const end_time = Math.floor(Number(o.end_time));
    if (
      !Number.isFinite(start_time) ||
      !Number.isFinite(end_time) ||
      end_time <= start_time
    ) {
      throw new Error("Invalid start_time/end_time in JSON");
    }
    return { start_time, end_time };
  };

  try {
    return coerce(tryParse(s));
  } catch {
    // fall through
  }

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = s.slice(start, end + 1);
    try {
      return coerce(tryParse(slice));
    } catch {
      // fall through
    }
  }

  throw new Error(
    `Gemini returned non-JSON timestamps: ${raw.length > 280 ? `${raw.slice(0, 280)}…` : raw}`
  );
}

/**
 * Uses Gemini video understanding on a **YouTube** URL to estimate clip bounds for a step.
 * Returns start/end times in seconds.
 */
export async function extractVideoTimestamps(
  youtubeUrl: string,
  stepName: string
): Promise<{ start_time: number; end_time: number }> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const urlTrim = youtubeUrl.trim();
  if (!extractYouTubeVideoId(urlTrim)) {
    throw new Error("Timestamp auto-detect supports YouTube URLs only.");
  }

  const name = stepName.trim();
  if (!name) {
    throw new Error("Step name is required for timestamp detection.");
  }

  const prompt = `You are analyzing a YouTube video provided as context.

For the step titled: "${name}"

Find the start and end timestamps (in whole seconds from the beginning of the video) for the segment that best matches this step. The segment should be contiguous and reasonably tight (not the entire video unless the whole video is truly about only this step).

Respond only with valid JSON, no markdown, no backticks. Use this exact shape:
{"start_time": <integer seconds>, "end_time": <integer seconds>}
Ensure end_time is strictly greater than start_time.`;

  const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL_VIDEO}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              fileData: {
                mimeType: "video/mp4",
                fileUri: urlTrim
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2
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

  return parseTimestampsPayload(text);
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
