import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { resolvePostAuthRedirect } from "@/lib/magiclog/authRedirect";
import { MAGICLOG_OAUTH_DEFAULT_NEXT } from "@/lib/magiclog/oauthCallback";
import { ensureMagicLogUser } from "@/lib/magiclog/profile";
import { safeNextPath } from "@/lib/magiclog/safeNextPath";

export async function POST(request: Request) {
  const supabase = createSupabaseRouteHandlerClient(request);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { next?: string } = {};
  try {
    body = (await request.json()) as { next?: string };
  } catch {
    /* empty body */
  }

  const nextParam = safeNextPath(body.next, MAGICLOG_OAUTH_DEFAULT_NEXT);

  try {
    await ensureMagicLogUser(supabase, user);
    const destination = await resolvePostAuthRedirect(supabase, nextParam);
    return NextResponse.json({ destination });
  } catch (err) {
    console.error("[api/auth/post-oauth] failed", err);
    return NextResponse.json({ error: "setup_failed" }, { status: 500 });
  }
}
