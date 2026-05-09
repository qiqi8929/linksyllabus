import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy Stripe success_url pointed here. Forward through the return handler so slots apply on the server.
 */
export default async function GuideUnlockCompleteRedirectPage({
  searchParams
}: {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await Promise.resolve(searchParams)) ?? {};
  const raw = sp.session_id;
  const sessionId = Array.isArray(raw) ? raw[0] : raw;
  const sid = typeof sessionId === "string" ? sessionId.trim() : "";

  if (!sid) {
    redirect("/dashboard?checkout=guide_unlock_missing_session");
  }

  redirect(`/api/stripe/guide-unlock-return?session_id=${encodeURIComponent(sid)}`);
}
