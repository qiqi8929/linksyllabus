import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/magiclog/OnboardingWizard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function BluebookOnboardingPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/magiclog/onboarding");

  const { data: profile } = await supabase
    .from("users")
    .select("bluebook_onboarding_complete")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.bluebook_onboarding_complete) {
    redirect("/magiclog/dashboard");
  }

  return (
    <Suspense fallback={<p className="text-sm text-zinc-600">Loading…</p>}>
      <OnboardingWizard />
    </Suspense>
  );
}
