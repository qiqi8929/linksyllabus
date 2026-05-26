import { NextResponse } from "next/server";
import { completePublicMentorSign } from "@/lib/magiclog/publicMentorSign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as {
      token?: string;
      signatureBase64?: string;
    };

    const token = body.token?.trim();
    const signatureBase64 = body.signatureBase64?.trim();

    if (!token) {
      return NextResponse.json({ error: "Missing signing token." }, { status: 400 });
    }
    if (!signatureBase64) {
      return NextResponse.json({ error: "Missing signature image." }, { status: 400 });
    }

    const pngBytes = Buffer.from(signatureBase64, "base64");
    if (!pngBytes.length) {
      return NextResponse.json({ error: "Invalid signature image." }, { status: 400 });
    }

    const result = await completePublicMentorSign(params.id, token, pngBytes);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sign failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
