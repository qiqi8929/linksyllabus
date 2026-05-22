import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { generateMagicLogSteps } from "@/lib/magiclog/generateSteps";
import { fetchMagicLogProfile } from "@/lib/magiclog/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { taskName?: string; youtubeUrl?: string };
  const taskName = String(body.taskName ?? "").trim();
  const youtubeUrl = String(body.youtubeUrl ?? "").trim();
  if (!taskName) {
    return NextResponse.json({ error: "taskName is required" }, { status: 400 });
  }

  const profile = await fetchMagicLogProfile(supabase, user.id);
  const trade = profile?.trade?.trim() || "Trades";

  try {
    const steps = await generateMagicLogSteps({
      taskName,
      trade,
      youtubeUrl: youtubeUrl || undefined
    });
    return NextResponse.json({ steps });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Step generation failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
