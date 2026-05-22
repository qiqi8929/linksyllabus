import nodemailer from "nodemailer";
import { env } from "@/lib/env";

function parseSmtpPort(raw: string | undefined): number {
  const p = Number(raw ?? "");
  if (!Number.isFinite(p) || p <= 0) return 587;
  return p;
}

export async function sendBluebookReminderEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const host = env.email.smtpHost()?.trim();
  const port = parseSmtpPort(env.email.smtpPort()?.trim());
  const smtpUser = env.email.smtpUser()?.trim();
  const smtpPass = env.email.smtpPass()?.trim();
  const from = env.email.from()?.trim() || smtpUser;

  if (!host || !smtpUser || !smtpPass || !from) {
    console.warn("[bluebook reminder] SMTP env missing; skip email", {
      to: params.to,
      subject: params.subject
    });
    return { ok: false, skipped: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass }
    });

    await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text
    });

    return { ok: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "send_failed";
    console.error("[bluebook reminder] send failed", e);
    return { ok: false, error: message };
  }
}
