import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { fetchMagicLogProfile } from "@/lib/magiclog/profile";
import {
  checklistToJson,
  DEFAULT_PERIOD_CHECKLIST,
  parseChecklistJson,
  type PeriodChecklistItem
} from "@/lib/magiclog/periodChecklist";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await fetchMagicLogProfile(supabase, user.id);
  const period = profile?.current_period ?? 1;

  const { data, error } = await supabase
    .from("period_progress")
    .select("checklist_json")
    .eq("user_id", user.id)
    .eq("period", period)
    .maybeSingle();

  if (error?.message?.includes("checklist_json")) {
    return NextResponse.json({
      period,
      items: DEFAULT_PERIOD_CHECKLIST,
      persisted: false
    });
  }

  const items = parseChecklistJson(data?.checklist_json);
  return NextResponse.json({ period, items, persisted: true });
}

export async function PATCH(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    period?: number;
    items?: PeriodChecklistItem[];
  };

  const profile = await fetchMagicLogProfile(supabase, user.id);
  const period = Math.max(1, Math.min(4, Math.floor(Number(body.period ?? profile?.current_period ?? 1))));
  const items = body.items ?? DEFAULT_PERIOD_CHECKLIST;
  const checklist_json = checklistToJson(items);

  const { error } = await supabase.from("period_progress").upsert(
    {
      user_id: user.id,
      period,
      checklist_json,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,period" }
  );

  if (error) {
    if (error.message.includes("checklist_json")) {
      return NextResponse.json(
        {
          error:
            "Period checklist storage is not available yet. Run supabase/migration_magiclog_features.sql."
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ period, items, persisted: true });
}
