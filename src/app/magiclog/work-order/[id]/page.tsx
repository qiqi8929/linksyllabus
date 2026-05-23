import { WorkOrderClient } from "@/components/magiclog/WorkOrderClient";
import { requireMagicLogUser } from "@/lib/magiclog/authRedirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MagicLogWorkOrderPage({
  params
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();
  const user = await requireMagicLogUser(
    supabase,
    `/magiclog/work-order/${params.id}`
  );

  const { data: profile } = await supabase
    .from("users")
    .select("bluebook_onboarding_complete")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.bluebook_onboarding_complete) {
    redirect("/magiclog/onboarding");
  }

  return <WorkOrderClient workOrderId={params.id} />;
}
