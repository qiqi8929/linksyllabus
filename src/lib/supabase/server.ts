import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<ReturnType<typeof cookies>["set"]>[2];
};

/** Parse `Cookie` header for Route Handlers when `cookies()` is empty (known Next.js + Supabase edge case). */
function parseRequestCookieHeader(header: string | null): { name: string; value: string }[] {
  if (!header?.trim()) return [];
  const out: { name: string; value: string }[] = [];
  for (const segment of header.split(";")) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const rawName = segment.slice(0, eq).trim();
    let rawVal = segment.slice(eq + 1).trim();
    try {
      rawVal = decodeURIComponent(rawVal);
    } catch {
      /* keep raw */
    }
    if (rawName) out.push({ name: rawName, value: rawVal });
  }
  return out;
}

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(env.supabase.url(), env.supabase.anonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignore cookie set errors from Server Components
        }
      }
    }
  });
}

/**
 * Use in App Router **Route Handlers** (`route.ts` GET/POST) so the session is read from the
 * incoming `Request` cookies. Fixes `getUser()` returning null while the dashboard still works.
 */
export function createSupabaseRouteHandlerClient(request: Request) {
  const fromHeader = parseRequestCookieHeader(request.headers.get("cookie"));
  const cookieStore = cookies();

  return createServerClient(env.supabase.url(), env.supabase.anonKey(), {
    cookies: {
      getAll() {
        if (fromHeader.length > 0) return fromHeader;
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* ignore */
        }
      }
    }
  });
}

