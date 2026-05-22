import { NextResponse } from "next/server";
import { runMagicLogReminders } from "@/lib/magiclog/reminders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cronSecret(): string | undefined {
  return (
    process.env.MAGICLOG_CRON_SECRET?.trim() ||
    process.env.BLUEBOOK_CRON_SECRET?.trim()
  );
}

function authorizeCron(req: Request): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const header =
    req.headers.get("x-magiclog-cron-secret") ??
    req.headers.get("x-bluebook-cron-secret");
  return header === secret;
}

/** Cron: POST with Authorization: Bearer MAGICLOG_CRON_SECRET */
export async function POST(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const summary = await runMagicLogReminders(admin);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Reminders failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
