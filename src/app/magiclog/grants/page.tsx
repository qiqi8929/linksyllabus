import { redirect } from "next/navigation";
import { GrantsClient } from "@/components/magiclog/GrantsClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchMagicLogProfile, profileNeedsOnboarding } from "@/lib/magiclog/profile";

export default async function MagicLogGrantsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup?next=/magiclog/grants");

  const profile = await fetchMagicLogProfile(supabase, user.id);
  if (!profile || profileNeedsOnboarding(profile)) {
    redirect("/magiclog/onboarding");
  }

  return <GrantsClient province={profile.province ?? "alberta"} />;
}
