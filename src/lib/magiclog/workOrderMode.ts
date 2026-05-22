import type { MagicLogVideoRef, MagicLogWorkOrder } from "@/lib/magiclog/types";

export type MagicLogCreationMode = "learn" | "steps_only" | "quick_log";

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

export function quickLogWorkedDate(order: Pick<MagicLogWorkOrder, "video_urls">): string | null {
  const urls = order.video_urls as MagicLogQuickLogMeta[] | null;
  const d = urls?.find((u) => u.workedDate)?.workedDate;
  return d?.trim() || null;
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
