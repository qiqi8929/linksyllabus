import type { BluebookVideoRef, BluebookWorkOrder } from "@/lib/magiclog/types";

export type BluebookCreationMode = "learn" | "steps_only" | "quick_log";

export type BluebookQuickLogMeta = BluebookVideoRef & {
  quickLog?: boolean;
  workedDate?: string;
  creationMode?: BluebookCreationMode;
};

export function isQuickLogWorkOrder(
  order: Pick<BluebookWorkOrder, "video_urls">
): boolean {
  const urls = order.video_urls as BluebookQuickLogMeta[] | null;
  return Boolean(urls?.some((u) => u.quickLog || u.creationMode === "quick_log"));
}

export function quickLogWorkedDate(order: Pick<BluebookWorkOrder, "video_urls">): string | null {
  const urls = order.video_urls as BluebookQuickLogMeta[] | null;
  const d = urls?.find((u) => u.workedDate)?.workedDate;
  return d?.trim() || null;
}

export function buildQuickLogVideoMeta(workedDate: string): BluebookQuickLogMeta[] {
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
