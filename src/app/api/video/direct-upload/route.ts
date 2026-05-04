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
  const apiToken = env.cloudflareStream.apiToken()?.trim();
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

  const upstream = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/stream/direct_upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        maxDurationSeconds: 60 * 60 * 4,
        requireSignedURLs: false,
        metadata: {
          userId: user.id,
          fileName,
          contentType
        }
      })
    }
  );

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
