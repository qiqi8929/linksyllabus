import { DashboardClient } from "@/components/magiclog/DashboardClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireMagicLogUser } from "@/lib/magiclog/authRedirect";
import { redirect } from "next/navigation";

export default async function BluebookDashboardPage() {
  const supabase = createSupabaseServerClient();
  const user = await requireMagicLogUser(supabase, "/magiclog/dashboard");

  const { data: profile } = await supabase
    .from("users")
    .select("bluebook_onboarding_complete")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.bluebook_onboarding_complete) {
    redirect("/magiclog/onboarding");
  }

  return <DashboardClient />;
}
