import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReqBody = {
  fileName?: unknown;
  fileSize?: unknown;
  contentType?: unknown;
};

function parsePositiveByteSize(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = parseInt(value.trim(), 10);
    return n > 0 ? n : null;
  }
  return null;
}

/** tus Upload-Metadata: `key base64value` pairs joined by commas (no spaces after commas). */
function encodeTusUploadMetadata(pairs: Record<string, string>): string {
  return Object.entries(pairs)
    .map(([key, val]) => `${key} ${Buffer.from(val, "utf8").toString("base64")}`)
    .join(",");
}

export async function POST(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const accountId = env.cloudflareStream.accountId()?.trim();
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim() ?? "";
  if (!accountId || !apiToken) {
    return NextResponse.json({ error: "Cloudflare Stream is not configured." }, { status: 500 });
  }

  let body: ReqBody = {};
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    // optional request body
  }

  const fileSize = parsePositiveByteSize(body.fileSize);
  if (fileSize == null) {
    return NextResponse.json(
      { error: "fileSize (bytes) is required for tus upload URL creation." },
      { status: 400 }
    );
  }

  const fileName =
    typeof body.fileName === "string" && body.fileName.trim()
      ? body.fileName.trim()
      : "upload-video";

  const streamTusUrl = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/stream`
  );
  streamTusUrl.searchParams.set("direct_user", "true");

  const uploadMetadata = encodeTusUploadMetadata({
    name: fileName
  });

  const upstream = await fetch(streamTusUrl.href, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(fileSize),
      "Upload-Metadata": uploadMetadata
    }
  });

  const locationRaw =
    upstream.headers.get("Location") ?? upstream.headers.get("location") ?? "";
  const location = locationRaw.trim();
  const videoId =
    (upstream.headers.get("stream-media-id") ?? upstream.headers.get("Stream-Media-Id") ?? "")
      .trim();

  if (!upstream.ok || !location) {
    let detail = `HTTP ${upstream.status}`;
    try {
      const errText = await upstream.text();
      if (errText) {
        const parsed = JSON.parse(errText) as {
          errors?: Array<{ message?: string }>;
        };
        detail = parsed?.errors?.[0]?.message ?? errText.slice(0, 500);
      }
    } catch {
      // ignore
    }
    return NextResponse.json(
      { error: detail || "Failed to create Cloudflare Stream tus upload URL." },
      { status: 502 }
    );
  }

  const uploadUrl = (() => {
    if (/^https?:\/\//i.test(location)) return location;
    return new URL(location, "https://api.cloudflare.com").href;
  })();

  if (!videoId) {
    return NextResponse.json(
      { error: "Cloudflare did not return stream-media-id; cannot track this upload." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    videoId,
    uploadUrl
  });
}
