import type { SupabaseClient } from "@supabase/supabase-js";
import { syncPeriodProgress } from "@/lib/magiclog/computeProgress";
import { fetchBluebookProfile } from "@/lib/magiclog/profile";
import { sendBluebookReminderEmail } from "@/lib/magiclog/sendEmail";

export type BluebookReminderType =
  | "no_work_order_3d"
  | "unsigned_work_order_2d"
  | "period_completion_30d";

const DEDUP_HOURS = 24 * 7;

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function periodEndDate(
  apprenticeshipStart: string | null,
  period: number
): Date | null {
  if (!apprenticeshipStart) return null;
  const start = new Date(apprenticeshipStart);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + period * 12);
  return end;
}

async function wasReminderSentRecently(
  admin: SupabaseClient,
  userId: string,
  type: BluebookReminderType
): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("bluebook_reminder_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("reminder_type", type)
    .gte("sent_at", since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function logReminderSent(
  admin: SupabaseClient,
  userId: string,
  type: BluebookReminderType
) {
  await admin.from("bluebook_reminder_logs").insert({
    user_id: userId,
    reminder_type: type
  });
}

async function sendReminder(
  admin: SupabaseClient,
  userId: string,
  email: string,
  type: BluebookReminderType,
  subject: string,
  text: string
): Promise<"sent" | "skipped_dedup" | "skipped_smtp" | "failed"> {
  if (await wasReminderSentRecently(admin, userId, type)) {
    return "skipped_dedup";
  }
  const result = await sendBluebookReminderEmail({ to: email, subject, text });
  if (result.skipped) return "skipped_smtp";
  if (!result.ok) return "failed";
  await logReminderSent(admin, userId, type);
  return "sent";
}

export async function runBluebookReminders(admin: SupabaseClient): Promise<{
  processed: number;
  sent: number;
  results: Array<{ userId: string; type: BluebookReminderType; status: string }>;
}> {
  const { data: users } = await admin
    .from("users")
    .select("id,email,bluebook_onboarding_complete,created_at")
    .eq("bluebook_onboarding_complete", true);

  const now = new Date();
  const results: Array<{ userId: string; type: BluebookReminderType; status: string }> =
    [];
  let sent = 0;

  for (const row of users ?? []) {
    const userId = row.id as string;
    const email = (row.email as string | null)?.trim();
    if (!email) continue;

    const profile = await fetchBluebookProfile(admin, userId);
    if (!profile) continue;

    const period = profile.current_period ?? 1;

    const { data: latestOrder } = await admin
      .from("bluebook_work_orders")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const accountStart = row.created_at
      ? new Date(row.created_at as string)
      : now;

    if (!latestOrder?.created_at) {
      if (daysBetween(accountStart, now) >= 3) {
        const status = await sendReminder(
          admin,
          userId,
          email,
          "no_work_order_3d",
          "Don't forget to log your work today",
          `Hi,\n\nYou haven't logged a work order in Magic Log yet. Add today's task so your period hours and competences stay up to date.\n\n— LinkSyllabus Magic Log`
        );
        results.push({ userId, type: "no_work_order_3d", status });
        if (status === "sent") sent += 1;
      }
    } else {
      const last = new Date(latestOrder.created_at as string);
      if (daysBetween(last, now) >= 3) {
        const status = await sendReminder(
          admin,
          userId,
          email,
          "no_work_order_3d",
          "Don't forget to log your work today",
          `Hi,\n\nIt's been a few days since your last work order in Magic Log. Log what you worked on today to keep your blue book current.\n\n— LinkSyllabus Magic Log`
        );
        results.push({ userId, type: "no_work_order_3d", status });
        if (status === "sent") sent += 1;
      }
    }

    const { data: staleUnsigned } = await admin
      .from("bluebook_work_orders")
      .select("id,task_name,competence_name,created_at")
      .eq("user_id", userId)
      .neq("status", "signed")
      .lt("created_at", new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString());

    if ((staleUnsigned?.length ?? 0) > 0) {
      const names = staleUnsigned!
        .slice(0, 3)
        .map((w) => w.task_name || w.competence_name)
        .join(", ");
      const status = await sendReminder(
        admin,
        userId,
        email,
        "unsigned_work_order_2d",
        "You have unsigned work orders — ask your mentor",
        `Hi,\n\nYou have work orders waiting for a mentor signature (e.g. ${names}). Ask your mentor to sign so your hours count toward your period.\n\n— LinkSyllabus Magic Log`
      );
      results.push({ userId, type: "unsigned_work_order_2d", status });
      if (status === "sent") sent += 1;
    }

    const progress = await syncPeriodProgress(admin, userId, period, profile);
    const end = periodEndDate(profile.apprenticeship_start_date, period);
    if (end && !progress.period_complete) {
      const daysUntilEnd = daysBetween(now, end);
      if (daysUntilEnd >= 0 && daysUntilEnd <= 30) {
        const status = await sendReminder(
          admin,
          userId,
          email,
          "period_completion_30d",
          `You're almost done Period ${period}!`,
          `Hi,\n\nYou're within 30 days of completing Period ${period} on your apprenticeship timeline. Check your progress in Magic Log and finish any remaining competences and hours.\n\n— LinkSyllabus Magic Log`
        );
        results.push({ userId, type: "period_completion_30d", status });
        if (status === "sent") sent += 1;
      }
    }
  }

  return { processed: users?.length ?? 0, sent, results };
}
