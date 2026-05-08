import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy Stripe success_url pointed here. Old sessions may still redirect to this path.
 * Never run server actions — only send users back to the dashboard (webhook + manual Create).
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

  const dest = new URLSearchParams();
  dest.set("checkout", "guide_unlock_success");
  if (sid) dest.set("session_id", sid);

  redirect(`/dashboard?${dest.toString()}`);
}
