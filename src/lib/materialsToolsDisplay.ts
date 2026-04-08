/**
 * Tutorial UI: detect a step row that holds Materials & Tools (some flows store
 * lists only on `steps`, not `skus.materials_text` / `tools_text`).
 */
export function isMaterialsToolsStepTitle(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (
    (n.includes("material") && n.includes("tool")) ||
    n === "materials & tools" ||
    n === "materials and tools"
  ) {
    return true;
  }
  if (/\bwhat\s+you(?:'ll|\s+will)?\s+need\b/.test(n)) return true;
  if (/\b(gather|get)\s+(your\s+)?(supplies|materials)\b/.test(n)) return true;
  if (/^materials?\s*[:\-–]/i.test(name.trim())) return true;
  if (/\bsupplies\s*(?:&|and)?\s*tools?\b/.test(n)) return true;
  if (n.includes("yarn and hook") || n.includes("hooks and yarn")) return true;
  return false;
}

/** Split a single block of text into Materials vs Tools (same heuristics as Gemini post-process). */
export function splitDescriptionIntoMaterialsAndTools(description: string): {
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
