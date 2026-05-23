import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMagicLogProfile, profileNeedsOnboarding } from "@/lib/magiclog/profile";

/** Logged-out users → signup; incomplete profile → onboarding; else dashboard. */
export async function redirectMagicLogTrialEntry(
  supabase: SupabaseClient,
  signupNext = "/magiclog/onboarding"
): Promise<never> {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signup?next=${encodeURIComponent(signupNext)}`);
  }

  const profile = await fetchMagicLogProfile(supabase, user.id);
  if (profileNeedsOnboarding(profile)) {
    redirect("/magiclog/onboarding");
  }

  redirect("/magiclog/dashboard");
}

/** Require a signed-in user for protected Magic Log pages. */
export async function requireMagicLogUser(
  supabase: SupabaseClient,
  nextPath: string
): Promise<{ id: string; email?: string | null }> {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signup?next=${encodeURIComponent(nextPath)}`);
  }

  return user;
}
