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

  const accountId = env.cloudflareStream.accountId()?.trim();
  const apiToken = env.cloudflareStream.apiToken()?.trim();
  if (!accountId || !apiToken) {
    return NextResponse.json({ error: "Cloudflare Stream is not configured." }, { status: 500 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";
  if (!videoId || !isCloudflareStreamVideoId(videoId)) {
    return NextResponse.json({ error: "A valid Cloudflare Stream videoId is required." }, { status: 400 });
  }

  try {
    await requestCloudflareStreamDefaultMp4Download({ accountId, apiToken, videoId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to enable downloads.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
