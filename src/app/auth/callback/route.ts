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

  const pendingCookies: CookieToSet[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        pendingCookies.push(...cookiesToSet);
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

  let destination: string;
  if (user) {
    try {
      await ensureMagicLogUser(supabase, user);
      destination = await resolvePostAuthRedirect(supabase, nextParam);
    } catch (err) {
      console.error("[auth/callback] post-auth setup failed", err);
      destination = `/login?error=oauth&next=${encodeURIComponent(nextParam)}`;
      pendingCookies.length = 0;
    }
  } else {
    destination = `/login?error=oauth&next=${encodeURIComponent(nextParam)}`;
    pendingCookies.length = 0;
  }

  const response = NextResponse.redirect(new URL(destination, requestUrl.origin));
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}
