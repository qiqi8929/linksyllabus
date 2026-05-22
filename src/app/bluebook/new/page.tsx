import { redirect } from "next/navigation";
import { NewWorkOrderClient } from "@/components/bluebook/NewWorkOrderClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function BluebookNewWorkOrderPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bluebook/new");

  const { data: profile } = await supabase
    .from("users")
    .select("current_period,bluebook_onboarding_complete")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.bluebook_onboarding_complete) {
    redirect("/bluebook/onboarding");
  }

  return (
    <section>
      <p className="mb-4 text-sm text-zinc-600">
        Choose how you want to record this competence — learn with video, checklist only, or
        quick hour log.
      </p>
      <NewWorkOrderClient defaultPeriod={profile.current_period ?? 1} />
    </section>
  );
}
