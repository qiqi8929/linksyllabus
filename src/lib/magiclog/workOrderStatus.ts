import type { WorkOrderStatus } from "@/lib/magiclog/types";

export function isWorkOrderEditable(status: WorkOrderStatus): boolean {
  return status === "draft";
}

export function isWorkOrderLocked(status: WorkOrderStatus): boolean {
  return status === "signed";
}
