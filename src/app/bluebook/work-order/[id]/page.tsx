import { WorkOrderClient } from "@/components/bluebook/WorkOrderClient";

export default function BluebookWorkOrderPage({
  params
}: {
  params: { id: string };
}) {
  return <WorkOrderClient workOrderId={params.id} />;
}
