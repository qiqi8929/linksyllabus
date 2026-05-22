import { NextResponse } from "next/server";
import { qrPngBuffer } from "@/lib/qrPng";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url")?.trim();
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const png = await qrPngBuffer(url);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400"
    }
  });
}
