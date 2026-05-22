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
