/**
 * Parse pasted text from external ChatGPT / Gemini (JSON or ```json``` block).
 */

export type ParsedStep = {
  step_name: string;
  description: string;
  start_time: number;
  end_time: number;
};

export type ParseAiTutorialPasteResult =
  | {
      ok: true;
      tutorialName?: string;
      materialsText: string;
      toolsText: string;
      steps: ParsedStep[];
    }
  | { ok: false; error: string };

function num(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

function pickString(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function normalizeStep(raw: Record<string, unknown>): ParsedStep | null {
  const step_name = pickString(raw, [
    "step_name",
    "stepName",
    "name",
    "title",
    "step"
  ]);
  const description = pickString(raw, ["description", "desc", "detail", "summary"]);
  const start_time = num(
    raw.start_time ?? raw.startTime ?? raw.start ?? raw.begin,
    0
  );
  const end_time = num(raw.end_time ?? raw.endTime ?? raw.end ?? raw.stop, start_time + 60);
  if (!step_name) return null;
  return { step_name, description, start_time, end_time: Math.max(end_time, start_time + 1) };
}

function parseJsonObject(o: Record<string, unknown>): ParseAiTutorialPasteResult {
  const tutorialName = pickString(o, ["tutorialName", "tutorial_name", "name", "title"]);

  const materialsText = pickString(o, [
    "materialsText",
    "materials_text",
    "materials",
    "material"
  ]);
  const toolsText = pickString(o, ["toolsText", "tools_text", "tools", "tool"]);

  let rawSteps: unknown = o.steps ?? o.instructional_steps ?? o.items;
  if (!Array.isArray(rawSteps) && Array.isArray(o)) {
    rawSteps = o;
  }
  if (!Array.isArray(rawSteps)) {
    return { ok: false, error: "JSON must include a \"steps\" array (or be an array of steps)." };
  }

  const steps: ParsedStep[] = [];
  for (const item of rawSteps) {
    if (!item || typeof item !== "object") continue;
    const row = normalizeStep(item as Record<string, unknown>);
    if (row) steps.push(row);
  }

  if (!steps.length) {
    return { ok: false, error: "No valid steps found (each needs a name/title field)." };
  }

  return {
    ok: true,
    ...(tutorialName ? { tutorialName } : {}),
    materialsText,
    toolsText,
    steps
  };
}

/** Strip optional ```json ... ``` wrapper */
function extractJsonBlock(raw: string): string {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : raw.trim();
}

export function parseAiTutorialPaste(raw: string): ParseAiTutorialPasteResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste is empty." };
  }

  const candidate = extractJsonBlock(trimmed);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return {
      ok: false,
      error:
        "Could not parse JSON. Paste a single JSON object with materials, tools, and steps (or wrap it in ```json ... ```)."
    };
  }

  if (Array.isArray(parsed)) {
    const steps: ParsedStep[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = normalizeStep(item as Record<string, unknown>);
      if (row) steps.push(row);
    }
    if (!steps.length) {
      return { ok: false, error: "Array has no steps with a name/title." };
    }
    return { ok: true, materialsText: "", toolsText: "", steps };
  }

  if (parsed && typeof parsed === "object") {
    return parseJsonObject(parsed as Record<string, unknown>);
  }

  return { ok: false, error: "Unsupported JSON shape." };
}
