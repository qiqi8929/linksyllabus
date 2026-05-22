import { NextResponse } from "next/server";
import { runBluebookReminders } from "@/lib/magiclog/reminders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorizeCron(req: Request): boolean {
  const secret = process.env.BLUEBOOK_CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get("x-bluebook-cron-secret") === secret;
}

/** Cron: POST with Authorization: Bearer BLUEBOOK_CRON_SECRET */
export async function POST(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const summary = await runBluebookReminders(admin);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Reminders failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
