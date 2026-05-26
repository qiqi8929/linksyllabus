import { randomBytes } from "crypto";
import { env } from "@/lib/env";
import type { MagicLogVideoRef } from "@/lib/magiclog/types";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateSigningToken(): { token: string; expiresAt: string } {
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  return { token, expiresAt };
}

export function buildMentorSignUrl(workOrderId: string, token: string): string {
  const base = env.appUrl()?.trim() || "http://localhost:3000";
  const origin = base.startsWith("http") ? base : `https://${base}`;
  return `${origin}/magiclog/sign/${workOrderId}?token=${encodeURIComponent(token)}`;
}

export function mergeSigningMetaIntoVideoUrls(
  videoUrls: MagicLogVideoRef[] | null | undefined,
  token: string,
  expiresAt: string,
  mentorPhone?: string | null
): MagicLogVideoRef[] {
  const list = Array.isArray(videoUrls) ? [...videoUrls] : [];
  const meta: MagicLogVideoRef & Record<string, unknown> = {
    videoId: "signing-meta",
    url: "",
    title: "Signing link",
    signingToken: token,
    signingTokenExpires: expiresAt
  };
  if (mentorPhone?.trim()) {
    meta.mentorPhone = mentorPhone.trim();
  }
  const withoutMeta = list.filter((v) => v.videoId !== "signing-meta");
  return [...withoutMeta, meta as MagicLogVideoRef];
}

export async function sendMentorSignSms(
  phone: string,
  signUrl: string,
  taskLabel: string
): Promise<{ sent: boolean; message: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !from) {
    return {
      sent: false,
      message:
        "SMS is not configured. Copy the signing link and text it to your mentor."
    };
  }

  const body = `Magic Log: Please sign off "${taskLabel}". ${signUrl}`;
  const normalized = phone.replace(/\D/g, "");
  const to = normalized.startsWith("1") ? `+${normalized}` : `+1${normalized}`;

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: body });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("[mentorSignLink] Twilio error", text);
    return { sent: false, message: "SMS failed to send. Copy the link below instead." };
  }

  return { sent: true, message: "Signing link sent by text message." };
}
