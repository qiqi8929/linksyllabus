import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/stripe/webhook") {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/bluebook")) {
    const dest = req.nextUrl.clone();
    dest.pathname = dest.pathname.replace(/^\/bluebook/, "/magiclog");
    return NextResponse.redirect(dest);
  }

  const isProtected =
    req.nextUrl.pathname.startsWith("/dashboard") ||
    req.nextUrl.pathname.startsWith("/magiclog");

  if (!isProtected) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnon) {
    console.error("[middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    if (req.nextUrl.pathname.startsWith("/dashboard")) {
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
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/magiclog/:path*",
    "/bluebook/:path*",
    "/api/stripe/webhook"
  ]
};

