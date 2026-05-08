import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { loadDashboardBootstrapData } from "@/lib/dashboardBootstrap";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req);
    const {
      data: { user },
      error: authErr
    } = await supabase.auth.getUser();
    if (authErr) {
      console.error("[api/dashboard/bootstrap] getUser error", authErr.message);
    }
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await loadDashboardBootstrapData(supabase, user.id);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate"
      }
    });
  } catch (e) {
    console.error("[api/dashboard/bootstrap] fatal", e);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}
