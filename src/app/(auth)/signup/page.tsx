import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchMagicLogProfile, profileNeedsOnboarding } from "@/lib/magiclog/profile";
import { safeNextPath } from "@/lib/magiclog/safeNextPath";
import { SignupForm } from "./SignupForm";

export default async function SignupPage({
  searchParams
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = safeNextPath(searchParams?.next, "/dashboard");

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    if (nextPath.startsWith("/magiclog")) {
      const profile = await fetchMagicLogProfile(supabase, user.id);
      if (profileNeedsOnboarding(profile)) {
        redirect("/magiclog/onboarding");
      }
      redirect("/magiclog/dashboard");
    }
    redirect(nextPath);
  }

  return <SignupForm nextPath={nextPath} />;
}
