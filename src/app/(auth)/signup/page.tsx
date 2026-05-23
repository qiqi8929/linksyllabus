import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePostAuthRedirect } from "@/lib/magiclog/authRedirect";
import { safeNextPath } from "@/lib/magiclog/safeNextPath";
import { SignupForm } from "./SignupForm";

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

  return <SignupForm nextPath={nextPath} />;
}
