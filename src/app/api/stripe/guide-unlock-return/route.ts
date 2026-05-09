import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { tryApplyGuideUnlockFromCheckoutSessionId } from "@/lib/stripe/guideUnlock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe guide-unlock `success_url` lands here first. Applies `paid_guide_slots + 1` via Supabase
 * admin (same idempotent path as the webhook) so the user sees the new limit immediately — no need
 * to wait for `checkout.session.completed`.
 */
export async function GET(req: Request) {
  const appUrl = env.appUrl().replace(/\/$/, "");
  const reqUrl = new URL(req.url);
  const sessionId = reqUrl.searchParams.get("session_id")?.trim() ?? "";

  if (!sessionId) {
    return NextResponse.redirect(`${appUrl}/dashboard?checkout=guide_unlock_missing_session`);
  }

  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id) {
    const resume = `/api/stripe/guide-unlock-return?session_id=${encodeURIComponent(sessionId)}`;
    return NextResponse.redirect(`${appUrl}/login?next=${encodeURIComponent(resume)}`);
  }

  try {
    const result = await tryApplyGuideUnlockFromCheckoutSessionId(sessionId, user.id);
    if (!result.ok) {
      console.warn("[guide-unlock-return] apply failed (Stripe webhook may still apply later)", {
        userId: user.id,
        sessionId,
        reason: result.reason
      });
    }
  } catch (e) {
    console.error("[guide-unlock-return] unexpected error", e);
  }

  return NextResponse.redirect(`${appUrl}/dashboard?checkout=guide_unlock_success`);
}
