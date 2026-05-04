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
  console.log("CF token prefix:", process.env.CLOUDFLARE_STREAM_API_TOKEN?.slice(0, 10));
  if (!accountId || !apiToken) {
    return NextResponse.json({ error: "Cloudflare Stream is not configured." }, { status: 500 });
  }

  let body: ReqBody = {};
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    // optional request body
  }

  const fileName =
    typeof body.fileName === "string" && body.fileName.trim()
      ? body.fileName.trim()
      : "upload-video";
  const contentType =
    typeof body.contentType === "string" && body.contentType.trim()
      ? body.contentType.trim()
      : "video/mp4";

  const cfDirectUploadUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/stream/direct_upload`;
  const cfRequestHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    "content-type": "application/json"
  };
  console.log("CF direct_upload request URL:", cfDirectUploadUrl);
  console.log("CF direct_upload request headers:", {
    Authorization: `Bearer ${apiToken.slice(0, 10)}…(total ${apiToken.length} chars; full value not logged)`,
    "content-type": cfRequestHeaders["content-type"]
  });

  const upstream = await fetch(cfDirectUploadUrl, {
    method: "POST",
    headers: cfRequestHeaders,
    body: JSON.stringify({
      maxDurationSeconds: 60 * 60 * 4,
      requireSignedURLs: false,
      metadata: {
        userId: user.id,
        fileName,
        contentType
      }
    })
  });

  const data = (await upstream.json()) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
    result?: { uid?: string; uploadURL?: string };
  };

  if (!upstream.ok || !data?.success || !data?.result?.uid || !data?.result?.uploadURL) {
    const msg = data?.errors?.[0]?.message || "Failed to create Cloudflare Stream upload URL.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({
    videoId: data.result.uid,
    uploadUrl: data.result.uploadURL
  });
}
