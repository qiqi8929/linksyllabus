import type { SupabaseClient } from "@supabase/supabase-js";

export type DashboardStepRow = {
  id: string;
  step_number: number;
  step_name: string;
  scan_count: number;
};

export type DashboardSkuRow = {
  id: string;
  name: string;
  is_active: boolean;
  steps: DashboardStepRow[] | null;
};

export async function loadDashboardBootstrapData(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  guideCount: number;
  paidGuideSlots: number;
  skus: DashboardSkuRow[];
}> {
  let skus: DashboardSkuRow[] = [];
  try {
    let rawSkus: Pick<DashboardSkuRow, "id" | "name" | "is_active">[] | null = null;
    {
      const ordered = await supabase
        .from("skus")
        .select("id,name,is_active")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (!ordered.error && ordered.data) {
        rawSkus = ordered.data;
      } else if (ordered.error) {
        const code = (ordered.error as { code?: string }).code;
        const msg = String(ordered.error.message ?? "").toLowerCase();
        const missingCreatedAt =
          code === "42703" || msg.includes("created_at") || msg.includes("does not exist");
        if (missingCreatedAt) {
          const fallback = await supabase
            .from("skus")
            .select("id,name,is_active")
            .eq("user_id", userId);
          if (!fallback.error && fallback.data) {
            rawSkus = fallback.data;
          } else if (fallback.error) {
            console.error("[dashboard bootstrap] skus select (fallback) failed", fallback.error);
          }
        } else {
          console.error("[dashboard bootstrap] skus select failed", ordered.error);
        }
      }
    }

    if (rawSkus?.length) {
      const ids = rawSkus.map((s) => s.id);
      const { data: stepRows, error: stepErr } = await supabase
        .from("steps")
        .select("id,sku_id,step_number,step_name,scan_count")
        .in("sku_id", ids);

      if (stepErr) {
        console.error("[dashboard bootstrap] steps select failed", stepErr);
        skus = rawSkus.map((s) => ({ ...s, steps: null }));
      } else {
        const bySku = new Map<string, DashboardStepRow[]>();
        for (const st of stepRows ?? []) {
          const sid = String((st as { sku_id: string }).sku_id);
          const row: DashboardStepRow = {
            id: String((st as { id: string }).id),
            step_number: Number((st as { step_number: number }).step_number),
            step_name: String((st as { step_name: string }).step_name),
            scan_count: Number((st as { scan_count: number }).scan_count ?? 0)
          };
          if (!bySku.has(sid)) bySku.set(sid, []);
          bySku.get(sid)!.push(row);
        }
        skus = rawSkus.map((s) => ({
          ...s,
          steps: bySku.get(s.id) ?? null
        }));
      }
    }
  } catch (e) {
    console.error("[dashboard bootstrap] skus/steps load threw", e);
    skus = [];
  }

  let guideCount = 0;
  let paidGuideSlots = 0;
  try {
    const { data: guideRow, error: guideCountError } = await supabase
      .from("users")
      .select("guide_count")
      .eq("id", userId)
      .maybeSingle();
    if (!guideCountError) {
      const parsed = Number(guideRow?.guide_count);
      if (Number.isFinite(parsed) && parsed >= 0) {
        guideCount = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(parsed));
      }
    } else {
      console.error("[dashboard bootstrap] guide_count read failed; defaulting to 0", {
        code: guideCountError.code,
        message: guideCountError.message
      });
    }
  } catch (e) {
    console.error("[dashboard bootstrap] guide_count query threw", e);
    guideCount = 0;
  }

  try {
    const { data: paidRow, error: paidSlotsError } = await supabase
      .from("users")
      .select("paid_guide_slots")
      .eq("id", userId)
      .maybeSingle();
    if (!paidSlotsError) {
      const paid = Number(paidRow?.paid_guide_slots);
      if (Number.isFinite(paid) && paid >= 0) {
        paidGuideSlots = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(paid));
      }
    } else {
      console.error("[dashboard bootstrap] paid_guide_slots read failed; defaulting to 0", {
        code: paidSlotsError.code,
        message: paidSlotsError.message
      });
    }
  } catch (e) {
    console.error("[dashboard bootstrap] paid_guide_slots query threw", e);
    paidGuideSlots = 0;
  }

  const safeSkus = skus.filter(
    (s) => typeof s.id === "string" && s.id.length > 0 && typeof s.name === "string"
  );

  return { guideCount, paidGuideSlots, skus: safeSkus };
}
