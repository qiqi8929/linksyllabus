import { WorkOrderClient } from "@/components/magiclog/WorkOrderClient";

export default function MagicLogWorkOrderPage({
  params
}: {
  params: { id: string };
}) {
  return <WorkOrderClient workOrderId={params.id} />;
}
