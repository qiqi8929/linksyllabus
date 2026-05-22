import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import {
  buildTradeAwareYouTubeSearchQuery,
  searchYouTubeVideos
} from "@/lib/youtubeSearch";
import { fetchBluebookProfile } from "@/lib/bluebook/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { taskName?: string };
  const taskName = String(body.taskName ?? "").trim();
  if (!taskName) {
    return NextResponse.json({ error: "taskName is required" }, { status: 400 });
  }

  const profile = await fetchBluebookProfile(supabase, user.id);
  const trade = profile?.trade?.trim() || "";
  const query = buildTradeAwareYouTubeSearchQuery(taskName, trade);

  try {
    const results = await searchYouTubeVideos(query, 5);
    return NextResponse.json({ results, query });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "YouTube search failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
