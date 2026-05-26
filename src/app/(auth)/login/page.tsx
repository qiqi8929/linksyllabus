import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePostAuthRedirect } from "@/lib/magiclog/authRedirect";
import { oauthCallbackRedirectPath } from "@/lib/magiclog/oauthCallback";
import { safeNextPath } from "@/lib/magiclog/safeNextPath";
import { MagicLogAuthScreen } from "@/components/auth/MagicLogAuthScreen";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: { next?: string; error?: string; code?: string };
}) {
  if (searchParams?.code) {
    redirect(
      oauthCallbackRedirectPath(searchParams.code, searchParams.next)
    );
  }

  const nextPath = safeNextPath(searchParams?.next, "/magiclog/onboarding");

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect(await resolvePostAuthRedirect(supabase, nextPath));
  }

  return (
    <MagicLogAuthScreen
      mode="login"
      nextPath={nextPath}
      initialError={searchParams?.error ?? null}
    />
  );
}
