import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { oauthCallbackRedirectUrl } from "@/lib/magiclog/oauthCallback";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function middleware(req: NextRequest) {
  const oauthRedirect = oauthCallbackRedirectUrl(req.nextUrl);
  if (oauthRedirect) {
    return NextResponse.redirect(oauthRedirect);
  }

  if (req.nextUrl.pathname === "/api/stripe/webhook") {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/bluebook")) {
    const dest = req.nextUrl.clone();
    dest.pathname = dest.pathname.replace(/^\/bluebook/, "/magiclog");
    return NextResponse.redirect(dest);
  }

  const pathname = req.nextUrl.pathname;
  const isMagicLogTrialEntry = pathname === "/magiclog" || pathname === "/magiclog/";
  /** Public mentor sign-off from SMS link — no login required. */
  const isPublicMentorSign = pathname.startsWith("/magiclog/sign/");
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/guides") ||
    (pathname.startsWith("/magiclog") && !isMagicLogTrialEntry && !isPublicMentorSign);

  if (!isProtected) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnon) {
    console.error("[middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    if (
      req.nextUrl.pathname.startsWith("/dashboard") ||
      req.nextUrl.pathname.startsWith("/guides")
    ) {
      const dest = req.nextUrl.clone();
      dest.pathname = "/login";
      dest.searchParams.set("error", "server_config");
      return NextResponse.redirect(dest);
    }
    return NextResponse.next();
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnon,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = req.nextUrl.clone();
    const isMagicLog = req.nextUrl.pathname.startsWith("/magiclog");
    redirectUrl.pathname = isMagicLog ? "/signup" : "/login";
    redirectUrl.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/signup",
    "/dashboard/:path*",
    "/guides",
    "/guides/:path*",
    "/magiclog",
    "/magiclog/",
    "/magiclog/:path*",
    "/bluebook/:path*",
    "/api/stripe/webhook"
  ]
};

