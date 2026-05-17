import { stripLeadingStepNumberFromTitle } from "@/lib/stepTitle";
import { stripLeadingMaterialsMetaLines } from "@/lib/stripMaterialsMeta";

export type WorkOrderStep = {
  id: string;
  step_number: number;
  step_name: string;
  description: string;
};

export type WorkOrderSku = {
  id: string;
  name: string;
  display_level: string;
  materials_text: string | null;
  tools_text: string | null;
};

export function formatWorkOrderStepNum(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatWorkOrderLevelLine(level: string, stepCount: number): string {
  const lvl = (level?.trim() || "General").toUpperCase();
  const n = stepCount === 1 ? "1 STEP" : `${stepCount} STEPS`;
  return `${lvl} — ${n}`;
}

function parseListItems(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^[\s\u2022\u00b7\-\u2013\u2014*]+/u, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

/** Comma-separated materials + tools for the work-order header band. */
export function formatWorkOrderMaterialsLine(
  materialsText: string | null,
  toolsText: string | null
): string {
  const materials = stripLeadingMaterialsMetaLines(materialsText?.trim() ?? "");
  const tools = stripLeadingMaterialsMetaLines(toolsText?.trim() ?? "");
  const items = [...parseListItems(materials), ...parseListItems(tools)];
  if (items.length === 0) return "";
  return items.join(" · ");
}

function descriptionParagraphs(desc: string): string[] {
  const t = desc.trim();
  if (!t) return [];
  const blocks = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks;
  return t.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Up to 3 concise bullets per step for the work order. */
export function descriptionToWorkOrderBullets(desc: string, max = 3): string[] {
  const paras = descriptionParagraphs(desc);
  if (paras.length === 0) {
    return ["Watch the linked video for this step."];
  }

  const bullets: string[] = [];
  for (const para of paras) {
    const sentences = para
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parts = sentences.length > 0 ? sentences : [para];
    for (const part of parts) {
      if (bullets.length >= max) break;
      bullets.push(part);
    }
    if (bullets.length >= max) break;
  }
  return bullets.slice(0, max);
}

export function workOrderStepTitle(step: WorkOrderStep): string {
  return stripLeadingStepNumberFromTitle(step.step_name);
}

