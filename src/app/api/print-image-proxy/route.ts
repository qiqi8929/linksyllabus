import { NextRequest, NextResponse } from "next/server";
import { isAllowedPrintImageProxyUrl } from "@/lib/printImageProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024;

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) {
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return "image/gif";
  }
  if (
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

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

    const ctRaw = upstream.headers.get("content-type") || "";
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: "too large" }, { status: 413 });
    }

    let mime = ctRaw.split(";")[0].trim().toLowerCase();
    if (!mime.startsWith("image/")) {
      const sniffed =
        mime === "application/octet-stream" || mime === "binary/octet-stream"
          ? sniffImageMime(buf)
          : null;
      if (!sniffed) {
        return NextResponse.json({ error: "not an image" }, { status: 415 });
      }
      mime = sniffed;
    }

    return new NextResponse(buf, {
      headers: {
        "content-type": mime,
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
