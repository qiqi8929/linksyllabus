import type { MagicLogVideoRef, MagicLogWorkOrder } from "@/lib/magiclog/types";

export type MagicLogCreationMode = "learn" | "steps_only" | "quick_log" | "type_it";

export type MagicLogQuickLogMeta = MagicLogVideoRef & {
  quickLog?: boolean;
  workedDate?: string;
  creationMode?: MagicLogCreationMode;
};

export function isQuickLogWorkOrder(
  order: Pick<MagicLogWorkOrder, "video_urls">
): boolean {
  const urls = order.video_urls as MagicLogQuickLogMeta[] | null;
  return Boolean(urls?.some((u) => u.quickLog || u.creationMode === "quick_log"));
}

export function isTypeItWorkOrder(
  order: Pick<MagicLogWorkOrder, "video_urls">
): boolean {
  const urls = order.video_urls as MagicLogQuickLogMeta[] | null;
  return Boolean(urls?.some((u) => u.typeIt || u.creationMode === "type_it"));
}

/** Quick log or type-it (manual hour logging without learn steps). */
export function isManualLogWorkOrder(
  order: Pick<MagicLogWorkOrder, "video_urls">
): boolean {
  return isQuickLogWorkOrder(order) || isTypeItWorkOrder(order);
}

export function quickLogWorkedDate(order: Pick<MagicLogWorkOrder, "video_urls">): string | null {
  const urls = order.video_urls as MagicLogQuickLogMeta[] | null;
  const d = urls?.find((u) => u.workedDate)?.workedDate;
  return d?.trim() || null;
}

export function buildTypeItVideoMeta(workedDate: string, notes?: string): MagicLogQuickLogMeta[] {
  return [
    {
      videoId: "type-it",
      url: "",
      title: notes?.trim() || "Type it",
      typeIt: true,
      workedDate,
      creationMode: "type_it",
      notes: notes?.trim() || undefined
    }
  ];
}

/** Work start date/time: quick-log worked date, otherwise record created_at. */
export function formatWorkOrderStartDate(
  order: Pick<MagicLogWorkOrder, "video_urls" | "created_at">
): string {
  const worked = quickLogWorkedDate(order);
  if (worked) {
    return new Date(`${worked}T12:00:00`).toLocaleDateString("en-CA", {
      dateStyle: "medium"
    });
  }
  if (order.created_at) {
    return new Date(order.created_at).toLocaleString("en-CA", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }
  return "—";
}

export function workOrderStartDateIso(
  order: Pick<MagicLogWorkOrder, "video_urls" | "created_at">
): string {
  const worked = quickLogWorkedDate(order);
  if (worked) return worked;
  if (order.created_at) return order.created_at.slice(0, 10);
  return "";
}

export function buildQuickLogVideoMeta(workedDate: string): MagicLogQuickLogMeta[] {
  return [
    {
      videoId: "quick-log",
      url: "",
      title: "Quick log",
      quickLog: true,
      workedDate,
      creationMode: "quick_log"
    }
  ];
}
