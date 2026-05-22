import { WorkOrderClient } from "@/components/magiclog/WorkOrderClient";

export default function BluebookWorkOrderPage({
  params
}: {
  params: { id: string };
}) {
  return <WorkOrderClient workOrderId={params.id} />;
}
