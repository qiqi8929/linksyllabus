import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSmtpPort(raw: string | undefined): number {
  const p = Number(raw ?? "");
  if (!Number.isFinite(p) || p <= 0) return 587;
  return p;
}

export async function POST(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    device?: string;
  };
  const signupEmail = String(body.email ?? "").trim() || user.email;
  const device = String(body.device ?? "").trim() || "Unknown device";
  const signupTime = new Date().toISOString();

  const host = env.email.smtpHost()?.trim();
  const port = parseSmtpPort(env.email.smtpPort()?.trim());
  const smtpUser = env.email.smtpUser()?.trim();
  const smtpPass = env.email.smtpPass()?.trim();
  const from = env.email.from()?.trim() || smtpUser;

  if (!host || !smtpUser || !smtpPass || !from) {
    console.warn("[new-signup notification] SMTP env missing; skip sending email", {
      hasHost: !!host,
      hasUser: !!smtpUser,
      hasPass: !!smtpPass,
      hasFrom: !!from
    });
    return NextResponse.json({ ok: false, skipped: true });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    await transporter.sendMail({
      from,
      to: "wy8929@gmail.com",
      subject: `New signup: ${signupEmail}`,
      text: [
        `User email: ${signupEmail}`,
        `Signup time: ${signupTime}`,
        `Device: ${device}`
      ].join("\n")
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[new-signup notification] send failed", e);
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 500 });
  }
}
