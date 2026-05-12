import { NextRequest, NextResponse } from "next/server";
import { isAllowedPrintImageProxyUrl } from "@/lib/printImageProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url")?.trim();
  if (!raw) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (!isAllowedPrintImageProxyUrl(target)) {
    return NextResponse.json({ error: "forbidden host" }, { status: 403 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);

  try {
    const upstream = await fetch(target.href, {
      method: "GET",
      headers: { Accept: "image/*,*/*;q=0.8" },
      redirect: "follow",
      signal: controller.signal
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "upstream failed" }, { status: 502 });
    }

    const ct = upstream.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) {
      return NextResponse.json({ error: "not an image" }, { status: 415 });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: "too large" }, { status: 413 });
    }

    return new NextResponse(buf, {
      headers: {
        "content-type": ct.split(";")[0].trim(),
        "cache-control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
