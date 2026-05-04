import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import {
  isCloudflareStreamVideoId,
  requestCloudflareStreamDefaultMp4Download
} from "@/lib/cloudflareStream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  videoId?: unknown;
};

export async function POST(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rawAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const rawToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  const accountId = env.cloudflareStream.accountId()?.trim();
  const apiToken = env.cloudflareStream.apiToken()?.trim();

  console.log("[stream-enable-download] env snapshot", {
    CLOUDFLARE_ACCOUNT_ID_defined: Boolean(rawAccountId),
    CLOUDFLARE_ACCOUNT_ID_length: rawAccountId?.length ?? 0,
    CLOUDFLARE_STREAM_API_TOKEN_defined: Boolean(rawToken),
    CLOUDFLARE_STREAM_API_TOKEN_length: rawToken?.length ?? 0,
    accountId_resolved_length: accountId?.length ?? 0,
    apiToken_resolved_length: apiToken?.length ?? 0
  });

  if (!accountId || !apiToken) {
    console.error("[stream-enable-download] missing Cloudflare env after resolve");
    return NextResponse.json({ error: "Cloudflare Stream is not configured." }, { status: 500 });
  }

  let rawBodyText = "";
  let body: Body = {};
  try {
    rawBodyText = await req.text();
    body = (rawBodyText ? JSON.parse(rawBodyText) : {}) as Body;
  } catch (e) {
    console.error("[stream-enable-download] JSON parse error", { rawBodyText: rawBodyText.slice(0, 500), e });
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const videoIdRaw = body.videoId;
  const videoId = typeof videoIdRaw === "string" ? videoIdRaw.trim() : "";
  console.log("[stream-enable-download] request body", {
    keys: Object.keys(body as Record<string, unknown>),
    videoId_type: typeof videoIdRaw,
    videoId_length: videoId.length,
    videoId_preview: videoId.slice(0, 8),
    id_format_ok: isCloudflareStreamVideoId(videoId)
  });

  if (!videoId || !isCloudflareStreamVideoId(videoId)) {
    return NextResponse.json({ error: "A valid Cloudflare Stream videoId is required." }, { status: 400 });
  }

  const downloadsUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/stream/${encodeURIComponent(videoId)}/downloads`;
  console.log("[stream-enable-download] calling Cloudflare POST /downloads", { downloadsUrl });

  try {
    await requestCloudflareStreamDefaultMp4Download({ accountId, apiToken, videoId });
    console.log("[stream-enable-download] Cloudflare POST /downloads OK", { videoId: videoId.slice(0, 12) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to enable downloads.";
    console.error("[stream-enable-download] Cloudflare error", { message, videoId: videoId.slice(0, 12) });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
