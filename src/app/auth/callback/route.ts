import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolvePostAuthRedirect } from "@/lib/magiclog/authRedirect";
import { ensureMagicLogUser } from "@/lib/magiclog/profile";
import { safeNextPath } from "@/lib/magiclog/safeNextPath";
import { env } from "@/lib/env";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = safeNextPath(
    requestUrl.searchParams.get("next"),
    "/magiclog/onboarding"
  );

  const supabaseUrl = env.supabase.url()?.trim();
  const supabaseAnon = env.supabase.anonKey()?.trim();
  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.redirect(
      new URL("/login?error=server_config", requestUrl.origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(
        `/login?error=oauth&next=${encodeURIComponent(nextParam)}`,
        requestUrl.origin
      )
    );
  }

  let response = NextResponse.redirect(new URL("/magiclog/onboarding", requestUrl.origin));

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchangeCodeForSession failed", error.message);
    return NextResponse.redirect(
      new URL(
        `/login?error=oauth&next=${encodeURIComponent(nextParam)}`,
        requestUrl.origin
      )
    );
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    await ensureMagicLogUser(supabase, user);
    const destination = await resolvePostAuthRedirect(supabase, nextParam);
    response = NextResponse.redirect(new URL(destination, requestUrl.origin));
  } else {
    response = NextResponse.redirect(
      new URL(
        `/login?error=oauth&next=${encodeURIComponent(nextParam)}`,
        requestUrl.origin
      )
    );
  }

  return response;
}
