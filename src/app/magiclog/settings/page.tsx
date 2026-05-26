import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/magiclog/SettingsClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchMagicLogProfile, profileNeedsOnboarding } from "@/lib/magiclog/profile";

export default async function MagicLogSettingsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup?next=/magiclog/settings");

  const profile = await fetchMagicLogProfile(supabase, user.id);
  if (!profile || profileNeedsOnboarding(profile)) {
    redirect("/magiclog/onboarding");
  }

  return <SettingsClient initialProfile={profile} />;
}
