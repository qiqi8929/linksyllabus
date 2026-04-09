import { env } from "@/lib/env";
import {
  fetchYouTubeOEmbedTitle,
  getTranscriptWithFallbacks,
  type TranscriptCue
} from "@/lib/transcript";
import {
  deleteGeminiFileByName,
  generateContentWithVideoFile,
  uploadVideoToGemini,
  waitForGeminiFileReady
} from "@/lib/geminiVideoFileApi";
import { extractYouTubeVideoId } from "@/lib/video";

/** Stable successor to deprecated `gemini-2.0-flash-lite` (not available to new users). */
const GEMINI_MODEL = "gemini-2.5-flash-lite";

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
 * Uses YouTube transcript + Gemini to estimate clip bounds for a single step.
 */
export async function extractVideoTimestamps(
  youtubeUrl: string,
  stepName: string,
  options?: { onGemini?: (payload: GeminiTimestampsDebugPayload) => void }
): Promise<{ start_time: number; end_time: number; estimated?: boolean }> {
  const name = stepName.trim();
  if (!name) {
    throw new Error("Step name is required for timestamp detection.");
  }
  if (!extractYouTubeVideoId(youtubeUrl.trim())) {
    throw new Error("A valid YouTube URL is required.");
  }

  try {
    const rows = await extractTimestampsForStepsFromYouTubeVideo(youtubeUrl, [name], options);
    const row = rows.find((r) => r.stepName === name) ?? rows[0];
    if (!row) {
      throw new Error("Could not determine timestamps for this step.");
    }
    return {
      start_time: row.start_time,
      end_time: row.end_time,
      estimated: row.estimated
    };
  } catch (e: unknown) {
    console.error("[gemini] extractVideoTimestamps → forced estimate", e);
    const est = await estimateTimestampsFromTitleAndSteps(youtubeUrl, [name], options);
    const row = est.find((r) => r.stepName === name) ?? est[0];
    return {
      start_time: row.start_time,
      end_time: row.end_time,
      estimated: true
    };
  }
}

export type StepTimestampFromVideo = {
  stepName: string;
  start_time: number;
  end_time: number;
  /** True when transcript was unavailable and times were guessed (oEmbed + Gemini or linear split). */
  estimated?: boolean;
};

/** Fired after a successful generateContent for timestamp matching (full REST body + model text). */
export type GeminiTimestampsDebugPayload = {
  responseJson: unknown;
  modelText: string;
};

/** @deprecated Use GeminiTimestampsDebugPayload */
export type GeminiYouTubeVideoDebugPayload = GeminiTimestampsDebugPayload;

/** Full-structure extraction for Auto-extract timestamps (Materials + steps with descriptions). */
export type TutorialStructureStep = {
  stepName: string;
  description: string;
  start_time: number;
  end_time: number;
};

export type ExtractTutorialStructureResult = {
  materialsText: string;
  toolsText: string;
  steps: TutorialStructureStep[];
  estimated: boolean;
};

const TUTORIAL_ANALYST_SYSTEM_PROMPT = `你是一个专业的手工教程分析师。我会给你一段YouTube视频的字幕文本，
请将视频内容切分成结构清晰的步骤。

【English — name field rules (must follow exactly)】
The 'name' field must contain ONLY the step title.
Do NOT include the words 'Time Segment', 'time segment',
'segment', or any time-related words in the name field.
Time information belongs only in the 'start' and 'end' fields.

【重要 — 字段分工】
- "name" 字段：只写步骤的标题（英文），描述这一步在做什么。禁止在 name 里出现任何时间相关信息，例如：秒数、时间戳、"Time Segment"、"Segment"、clock、MM:SS、(0:30–1:20) 等。
- 时间只允许出现在 "start" 和 "end" 两个字段里，且必须是整数秒（从视频开头算起）。
- "description" 里也不要写起止秒数；步骤时长只能通过 start/end 体现。

输出要求：

第一步固定为Materials & Tools：
{
  "name": "Materials & Tools",
  "description": "列出视频中提到的所有材料和工具，每项单独一行，包含具体规格。例如：\\n- Yarn: Bulky weight (Level 5) in grey and white\\n- Hook: 5.0mm crochet hook\\n- Notions: Safety eyes 10mm, fiberfill stuffing, scissors, yarn needle",
  "start": 0,
  "end": [第一个实际操作步骤开始的秒数]
}

其余步骤6-9个，每个步骤：
{
  "name": "[步骤标题：5-8个英文单词，只描述动作/对象，不含时间]",
  "description": "[2-4句话，简洁清晰，适合初学者理解]",
  "start": [开始秒数，整数],
  "end": [结束秒数，整数，必须严格大于 start]
}

步骤标题规则：
- 好：「Make the Magic Ring Foundation」「Shape the Bunny Head (Rounds 1-4)」
- 差：「Start」「Continue crocheting」「Next step」「Master the Pattern Time Segment」（禁止在标题末尾加 Time Segment 等字样）

输出格式为JSON数组，直接返回数组，不要任何额外文字。`;

/** Remove common model artifacts that mix timing into titles. */
function sanitizeTutorialStepName(name: string): string {
  let n = name.trim();
  n = n.replace(/\btime\s+segment\b/gi, "");
  n = n.replace(/\s+time\s+segment\s*$/i, "");
  n = n.replace(/\s*\(\s*\d+\s*[:：]\s*\d+\s*[-–]\s*\d+\s*[:：]\s*\d+\s*\)\s*$/i, "");
  n = n.replace(/\s*\(\s*\d+(?:\.\d+)?\s*s(?:ec(?:onds)?)?\s*[-–]\s*\d+(?:\.\d+)?\s*s(?:ec(?:onds)?)?\s*\)\s*$/i, "");
  n = n.replace(/\s{2,}/g, " ").replace(/^\s+|\s+$/g, "");
  return n.replace(/\s+/g, " ").trim();
}

function isMaterialsToolsStepName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    (n.includes("material") && n.includes("tool")) ||
    n === "materials & tools" ||
    n === "materials and tools"
  );
}

function splitMaterialsToolsFromDescription(description: string): {
  materialsText: string;
  toolsText: string;
} {
  const t = description.trim();
  if (!t) {
    return { materialsText: "", toolsText: "" };
  }
  const toolsHeader = /(?:^|\n)\s*(?:tools?|tool|notions?)\s*[:：]?\s*/i;
  const m = t.match(toolsHeader);
  if (m && m.index !== undefined && m.index > 0) {
    return {
      materialsText: t.slice(0, m.index).trim(),
      toolsText: t.slice(m.index + m[0].length).trim()
    };
  }
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const toolLine = (line: string) =>
    /\b(hook|needle|scissors|shears|pliers|cutter|loom|hooks?)\b/i.test(line);
  const toolsLines = lines.filter(toolLine);
  const matLines = lines.filter((l) => !toolLine(l));
  if (toolsLines.length > 0 && matLines.length > 0) {
    return {
      materialsText: matLines.join("\n"),
      toolsText: toolsLines.join("\n")
    };
  }
  return { materialsText: t, toolsText: "" };
}

function parseTutorialStructureJsonArray(raw: string): Array<{
  name: string;
  description: string;
  start: number;
  end: number;
}> {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*\r?\n?/i, "");
  s = s.replace(/\r?\n?```\s*$/i, "");
  s = s.trim();

  const coerceRow = (item: unknown): {
    name: string;
    description: string;
    start: number;
    end: number;
  } | null => {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const rawName = String(o.name ?? o.stepName ?? "").trim();
    const name = sanitizeTutorialStepName(rawName);
    const description = String(o.description ?? "").trim();
    // Prefer explicit start/end; avoid mixing up with unrelated keys
    const startRaw = o.start ?? o.start_time ?? o.start_time_seconds ?? o.startSec;
    let endRaw = o.end ?? o.end_time ?? o.end_time_seconds ?? o.endSec;
    const durRaw = o.duration ?? o.duration_seconds ?? o.duration_sec;
    let start = Math.floor(Number(startRaw));
    let end = Math.floor(Number(endRaw));
    if (!name || !Number.isFinite(start)) return null;
    if (!Number.isFinite(end) && Number.isFinite(Number(durRaw)) && Number.isFinite(start)) {
      end = start + Math.floor(Number(durRaw));
    }
    if (!Number.isFinite(end)) return null;
    if (end < start) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    if (end <= start && !isMaterialsToolsStepName(name)) return null;
    return { name, description, start, end };
  };

  const parseArray = (chunk: string) => {
    const arr = JSON.parse(chunk) as unknown;
    if (!Array.isArray(arr)) throw new Error("Expected JSON array");
    const out: Array<{ name: string; description: string; start: number; end: number }> = [];
    for (const item of arr) {
      const row = coerceRow(item);
      if (row) out.push(row);
    }
    return out;
  };

  try {
    return parseArray(s);
  } catch {
    /* fall through */
  }

  const lb = s.indexOf("[");
  const rb = s.lastIndexOf("]");
  if (lb >= 0 && rb > lb) {
    return parseArray(s.slice(lb, rb + 1));
  }

  throw new Error(
    `Gemini returned non-JSON array: ${raw.length > 280 ? `${raw.slice(0, 280)}…` : raw}`
  );
}

const MIN_STEP_CLIP_SEC = 5;

function normalizeContiguousSteps(steps: TutorialStructureStep[]): TutorialStructureStep[] {
  if (steps.length === 0) return [];
  const sorted = [...steps].sort((a, b) => {
    if (a.start_time !== b.start_time) return a.start_time - b.start_time;
    return a.end_time - b.end_time;
  });
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (next.start_time > cur.start_time) {
      cur.end_time = next.start_time;
    } else {
      if (cur.end_time <= cur.start_time) {
        cur.end_time = cur.start_time + MIN_STEP_CLIP_SEC;
      }
    }
  }
  const last = sorted[sorted.length - 1];
  if (last.end_time <= last.start_time) {
    last.end_time = last.start_time + MIN_STEP_CLIP_SEC;
  }
  return sorted;
}

/**
 * Uses timed YouTube transcript + Gemini to output Materials & Tools plus 6–9 instructional steps
 * (name, description, start/end). Contiguous timeline: each step's end equals the next step's start.
 */
export async function extractTutorialStructureFromYouTubeVideo(
  youtubeUrl: string,
  options?: { onGemini?: (payload: GeminiTimestampsDebugPayload) => void }
): Promise<ExtractTutorialStructureResult> {
  const urlTrim = youtubeUrl.trim();
  const videoId = extractYouTubeVideoId(urlTrim);
  if (!videoId) {
    throw new Error("A valid YouTube URL is required.");
  }

  const fetched = await getTranscriptWithFallbacks(videoId);
  const cues = fetched?.cues ?? [];
  if (cues.length === 0) {
    throw new Error(
      "No captions found for this video. Use a video with captions, or enter steps manually."
    );
  }

  const formatted = cues
    .map((c) => {
      const end = c.start + c.duration;
      return `[${c.start.toFixed(2)}s → ${end.toFixed(2)}s] ${c.text}`;
    })
    .join("\n");

  const prompt = `${TUTORIAL_ANALYST_SYSTEM_PROMPT}

---

下面是该视频的带时间戳字幕（单位：秒）。请严格基于字幕内容划分步骤。
- start、end：仅在此两处写整数秒（从视频 0 秒算起）；name/description 中不要写秒数。
- Reminder: each "name" must be a short title only — never append "Time Segment", "segment", or any time wording (English rules at top of prompt).
- 除 Materials & Tools 外，每一步必须满足 end > start；相邻实际操作步骤的 start 应随时间递增，不要两段共用同一 start。

字幕：
${formatted}`;

  const text = await generateContentPlainText(prompt, 0.2, options?.onGemini);
  const rows = parseTutorialStructureJsonArray(text);

  if (rows.length === 0) {
    throw new Error("The model did not return any steps. Try again or shorten the video.");
  }

  let materialsDescription = "";
  let work = rows;

  if (isMaterialsToolsStepName(rows[0].name)) {
    materialsDescription = rows[0].description;
    work = rows.slice(1);
  }

  if (work.length === 0) {
    throw new Error(
      "The model returned only a Materials & Tools block. Try again or add instructional steps manually."
    );
  }

  const mapped: TutorialStructureStep[] = work.map((r) => ({
    stepName: sanitizeTutorialStepName(r.name),
    description: r.description,
    start_time: r.start,
    end_time: r.end
  }));

  const steps = normalizeContiguousSteps(mapped);
  const { materialsText, toolsText } = splitMaterialsToolsFromDescription(materialsDescription);

  return {
    materialsText,
    toolsText,
    steps,
    estimated: false
  };
}

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

async function generateContentPlainText(
  prompt: string,
  temperature: number,
  onGemini?: (payload: GeminiTimestampsDebugPayload) => void
): Promise<string> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
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
  onGemini?.({ responseJson: data, modelText: text });
  return text;
}

/**
 * Sends timed transcript + step names to Gemini; returns semantic start/end seconds per step.
 */
export async function matchStepsToTranscript(
  transcript: TranscriptCue[],
  stepNames: string[],
  options?: { onGemini?: (payload: GeminiTimestampsDebugPayload) => void }
): Promise<StepTimestampFromVideo[]> {
  const names = stepNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    throw new Error("Add at least one step name before extracting timestamps.");
  }
  if (transcript.length === 0) {
    throw new Error("Transcript is empty.");
  }

  const formatted = transcript
    .map((s) => {
      const end = s.start + s.duration;
      return `[${s.start.toFixed(2)}s → ${end.toFixed(2)}s] ${s.text}`;
    })
    .join("\n");

  const list = names.map((n) => `- ${n}`).join("\n");

  const prompt = `Given this YouTube transcript with timestamps, find the start and end time (in seconds) for each of these steps:

${list}

Transcript:
${formatted}

Return only JSON, no markdown or backticks. Use this exact shape:
[{"stepName":"<exact step name>","start_time_seconds":0,"end_time_seconds":60},...]
One object per step in the same order as listed above. Use whole seconds from the start of the video. Each end_time_seconds must be greater than start_time_seconds.`;

  const text = await generateContentPlainText(prompt, 0.2, options?.onGemini);
  return parseVideoStepTimestampsArray(text);
}

function linearEstimatedTimestamps(
  names: string[],
  totalSeconds: number
): StepTimestampFromVideo[] {
  const n = names.length;
  if (n === 0) return [];
  const chunk = Math.max(20, Math.floor(totalSeconds / n));
  return names.map((stepName, i) => {
    const start_time = i * chunk;
    const end_time = i === n - 1 ? totalSeconds : (i + 1) * chunk - 1;
    return {
      stepName,
      start_time,
      end_time: Math.max(end_time, start_time + 15),
      estimated: true
    };
  });
}

/**
 * When no transcript is available: oEmbed title + Gemini guesses, then linear split (never throws).
 */
export async function estimateTimestampsFromTitleAndSteps(
  youtubeUrl: string,
  stepNames: string[],
  options?: { onGemini?: (payload: GeminiTimestampsDebugPayload) => void }
): Promise<StepTimestampFromVideo[]> {
  const names = stepNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    return [{ stepName: "step", start_time: 0, end_time: 60, estimated: true }];
  }

  let title: string | null = null;
  try {
    title = await fetchYouTubeOEmbedTitle(youtubeUrl);
  } catch (e: unknown) {
    console.error("[gemini] oEmbed title fetch failed", e);
  }
  const displayTitle = title ?? "YouTube tutorial video";

  try {
    const list = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
    const prompt = `Video title: "${displayTitle}"

Steps (in order):
${list}

There is no usable transcript. Assume a typical YouTube tutorial. Output plausible start and end times in seconds for each step: they must be in order, non-overlapping, and span the full video. If total duration is unknown, assume about 12 minutes (720 seconds).

Return JSON only, no markdown:
[{"stepName":"<exact name>","start_time_seconds":0,"end_time_seconds":120},...]
Whole seconds. end_time_seconds must be greater than start_time_seconds.`;

    const text = await generateContentPlainText(prompt, 0.35, options?.onGemini);
    const rows = parseVideoStepTimestampsArray(text);
    if (rows.length === names.length) {
      return rows.map((r) => ({ ...r, estimated: true }));
    }
    console.error(
      "[gemini] estimateTimestampsFromTitleAndSteps: Gemini row count mismatch",
      rows.length,
      names.length
    );
  } catch (e: unknown) {
    console.error("[gemini] estimateTimestampsFromTitleAndSteps Gemini failed", e);
  }

  return linearEstimatedTimestamps(names, 720);
}

/**
 * Transcript strategies first; then oEmbed + Gemini; then linear estimates (always returns rows).
 */
export async function extractTimestampsForStepsFromYouTubeVideo(
  youtubeUrl: string,
  stepNames: string[],
  options?: { onGemini?: (payload: GeminiTimestampsDebugPayload) => void }
): Promise<StepTimestampFromVideo[]> {
  const urlTrim = youtubeUrl.trim();
  const videoId = extractYouTubeVideoId(urlTrim);
  if (!videoId) {
    throw new Error("A valid YouTube URL is required.");
  }

  const expected = stepNames.map((s) => s.trim()).filter(Boolean).length;

  try {
    const fetched = await getTranscriptWithFallbacks(videoId);
    if (fetched?.cues?.length) {
      try {
        const matched = await matchStepsToTranscript(fetched.cues, stepNames, options);
        if (matched.length === expected && expected > 0) {
          return matched;
        }
        console.error(
          "[gemini] matchStepsToTranscript length mismatch, using estimate fallback",
          matched.length,
          expected
        );
      } catch (e: unknown) {
        console.error("[gemini] matchStepsToTranscript failed, using estimate fallback", e);
      }
    } else {
      console.log(
        "[gemini] no transcript from any source; using title/Gemini estimate",
        JSON.stringify({ videoId })
      );
    }

    return await estimateTimestampsFromTitleAndSteps(urlTrim, stepNames, options);
  } catch (e: unknown) {
    console.error("[gemini] extractTimestampsForStepsFromYouTubeVideo fatal → estimate", e);
    return estimateTimestampsFromTitleAndSteps(urlTrim, stepNames, options);
  }
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

function parseMaterialsToolsPayload(raw: string): { materials: string; tools: string } {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*\r?\n?/i, "");
  s = s.replace(/\r?\n?```\s*$/i, "");
  s = s.trim();

  const coerce = (chunk: string) => {
    const o = JSON.parse(chunk) as { materials?: unknown; tools?: unknown };
    return {
      materials: String(o.materials ?? "").trim(),
      tools: String(o.tools ?? "").trim()
    };
  };

  try {
    return coerce(s);
  } catch {
    /* fall through */
  }

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return coerce(s.slice(start, end + 1));
  }

  throw new Error(
    `Gemini returned non-JSON: ${raw.length > 200 ? `${raw.slice(0, 200)}…` : raw}`
  );
}

/**
 * Uses YouTube transcript + Gemini to list materials vs tools (for print / tutorial intro).
 */
export async function extractMaterialsAndToolsFromYouTube(
  youtubeUrl: string
): Promise<{ materials: string; tools: string }> {
  const urlTrim = youtubeUrl.trim();
  const videoId = extractYouTubeVideoId(urlTrim);
  if (!videoId) {
    throw new Error("A valid YouTube URL is required.");
  }

  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const fetched = await getTranscriptWithFallbacks(videoId);
  const cues = fetched?.cues ?? [];
  const transcriptText = cues
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120000);

  if (!transcriptText) {
    throw new Error(
      "No captions found for this video. Enter materials manually or use a video with captions."
    );
  }

  const prompt = `You help with DIY / craft / tutorial videos. Below is the spoken transcript (often the creator lists materials and tools near the start).

Extract two plain-text lists for the viewer:

1) "materials" — yarns, fabric, stuffing, glue, quantities, colors, etc. Use short lines separated by newlines, or comma-separated if compact. Do not invent items not clearly implied in the transcript.

2) "tools" — hooks, needles, scissors, looms, etc. Same formatting. If something could be either, prefer "materials" unless it is clearly a tool.

Transcript:
${transcriptText}

Respond only with valid JSON, no markdown, no backticks. Exact shape:
{"materials":"...","tools":"..."}
Use empty string "" if a category has nothing in the transcript.`;

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4
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

  return parseMaterialsToolsPayload(text);
}

/** Auto-extract from uploaded files: keep under this to avoid timeouts / OOM on typical serverless hosts. */
export const MAX_VIDEO_BYTES_FOR_GEMINI_ANALYSIS = 80 * 1024 * 1024;

/**
 * Same output shape as {@link extractTutorialStructureFromYouTubeVideo}, but analyzes an uploaded
 * video file via Gemini File API (no YouTube transcript).
 */
export async function extractTutorialStructureFromUploadedVideoBuffer(
  buffer: Buffer,
  mimeType: string,
  options?: { onGemini?: (payload: GeminiTimestampsDebugPayload) => void }
): Promise<ExtractTutorialStructureResult> {
  const displayName = `upload-${Date.now()}.bin`;
  let fileName: string | null = null;
  try {
    const uploaded = await uploadVideoToGemini(buffer, mimeType, displayName);
    fileName = uploaded.name;
    await waitForGeminiFileReady(uploaded.name);

    const prompt = `${TUTORIAL_ANALYST_SYSTEM_PROMPT}

---

下面是用户上传的视频（无单独字幕文本）。请**直接观看视频**（画面与声音），按上述规则输出 JSON 数组。
- start、end：仅在此两处写整数秒（从视频 0 秒算起）；name/description 中不要写秒数。
- 除 Materials & Tools 外，每一步必须满足 end > start；相邻实际操作步骤的 start 应随时间递增，不要两段共用同一 start。
- 若视频较短，步骤数量可少于 6，但必须覆盖主要操作过程。

`;

    const text = await generateContentWithVideoFile(
      uploaded.uri,
      mimeType,
      prompt,
      0.2,
      options?.onGemini
        ? (p) =>
            options.onGemini?.({
              responseJson: p.responseJson,
              modelText: p.modelText
            })
        : undefined
    );

    const rows = parseTutorialStructureJsonArray(text);

    if (rows.length === 0) {
      throw new Error("The model did not return any steps. Try again or shorten the video.");
    }

    let materialsDescription = "";
    let work = rows;

    if (isMaterialsToolsStepName(rows[0].name)) {
      materialsDescription = rows[0].description;
      work = rows.slice(1);
    }

    if (work.length === 0) {
      throw new Error(
        "The model returned only a Materials & Tools block. Try again or add instructional steps manually."
      );
    }

    const mapped: TutorialStructureStep[] = work.map((r) => ({
      stepName: sanitizeTutorialStepName(r.name),
      description: r.description,
      start_time: r.start,
      end_time: r.end
    }));

    const steps = normalizeContiguousSteps(mapped);
    const { materialsText, toolsText } = splitMaterialsToolsFromDescription(materialsDescription);

    return {
      materialsText,
      toolsText,
      steps,
      estimated: false
    };
  } finally {
    if (fileName) {
      await deleteGeminiFileByName(fileName).catch(() => {});
    }
  }
}

export async function extractMaterialsAndToolsFromVideoBuffer(
  buffer: Buffer,
  mimeType: string,
  options?: { onGemini?: (payload: GeminiTimestampsDebugPayload) => void }
): Promise<{ materials: string; tools: string }> {
  const displayName = `materials-${Date.now()}.bin`;
  let fileName: string | null = null;
  try {
    const uploaded = await uploadVideoToGemini(buffer, mimeType, displayName);
    fileName = uploaded.name;
    await waitForGeminiFileReady(uploaded.name);

    const prompt = `You are helping with DIY / craft / tutorial videos. Watch the uploaded video.

Extract two plain-text lists:

1) "materials" — yarns, fabric, stuffing, glue, quantities, colors, etc. Use short lines separated by newlines, or comma-separated if compact. Do not invent items not clearly shown or said.

2) "tools" — hooks, needles, scissors, looms, etc. Same formatting. If something could be either, prefer "materials" unless it is clearly a tool.

Respond only with valid JSON, no markdown, no backticks. Exact shape:
{"materials":"...","tools":"..."}
Use empty string "" if a category has nothing in the video.`;

    const text = await generateContentWithVideoFile(
      uploaded.uri,
      mimeType,
      prompt,
      0.35,
      options?.onGemini
        ? (p) =>
            options.onGemini?.({
              responseJson: p.responseJson,
              modelText: p.modelText
            })
        : undefined
    );

    return parseMaterialsToolsPayload(text);
  } finally {
    if (fileName) {
      await deleteGeminiFileByName(fileName).catch(() => {});
    }
  }
}
