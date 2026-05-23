import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePostAuthRedirect } from "@/lib/magiclog/authRedirect";
import { safeNextPath } from "@/lib/magiclog/safeNextPath";
import { MagicLogAuthScreen } from "@/components/auth/MagicLogAuthScreen";

export default async function SignupPage({
  searchParams
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = safeNextPath(searchParams?.next, "/magiclog/onboarding");

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect(await resolvePostAuthRedirect(supabase, nextPath));
  }

  return <MagicLogAuthScreen mode="signup" nextPath={nextPath} />;
}
