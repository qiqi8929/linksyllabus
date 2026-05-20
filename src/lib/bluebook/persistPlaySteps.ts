import type { SupabaseClient } from "@supabase/supabase-js";
import type { BluebookAiStep } from "@/lib/bluebook/types";

function clipBounds(
  steps: BluebookAiStep[],
  index: number,
  durationSec?: number
): { start_time: number; end_time: number } {
  const n = steps.length;
  const duration =
    durationSec && durationSec > 0 ? Math.floor(durationSec) : Math.max(n * 30, 60);
  const step = steps[index];
  const start_time =
    step.start_time != null
      ? Math.floor(step.start_time)
      : n > 0
        ? Math.floor((duration / n) * index)
        : 0;
  const nextStart =
    index < n - 1
      ? steps[index + 1].start_time != null
        ? Math.floor(steps[index + 1].start_time!)
        : Math.floor((duration / n) * (index + 1))
      : duration;
  const end_time =
    step.end_time != null
      ? Math.floor(step.end_time)
      : Math.max(start_time + 1, nextStart - 1);
  return {
    start_time,
    end_time: Math.min(end_time, Math.max(start_time + 1, duration - 1))
  };
}

/** Create `steps` rows so /play/[step_id] and work-order QRs work for Bluebook learning pages. */
export async function persistBluebookPlaySteps(
  supabase: SupabaseClient,
  params: {
    userId: string;
    workOrderId: string;
    competenceName: string;
    steps: BluebookAiStep[];
    youtubeUrl: string;
    durationSec?: number;
  }
): Promise<BluebookAiStep[]> {
  const { steps, youtubeUrl } = params;
  if (!youtubeUrl.trim() || steps.length === 0) return steps;
  if (steps.every((s) => s.id)) return steps;

  const skuName = `Bluebook · ${params.competenceName}`.slice(0, 120);

  const skuInsertFull = {
    user_id: params.userId,
    name: skuName,
    description: `Bluebook work order ${params.workOrderId}`,
    youtube_url: youtubeUrl,
    start_time: 0,
    end_time: 0,
    scan_count: 0,
    is_active: true
  };
  const skuInsertFallback = {
    user_id: params.userId,
    name: skuName,
    description: `Bluebook work order ${params.workOrderId}`,
    scan_count: 0,
    is_active: true
  };

  let skuId: string | null = null;
  const { data: skuFull, error: skuErr } = await supabase
    .from("skus")
    .insert(skuInsertFull)
    .select("id")
    .single();
  if (!skuErr && skuFull) {
    skuId = skuFull.id;
  } else {
    const { data: skuFb, error: skuFbErr } = await supabase
      .from("skus")
      .insert(skuInsertFallback)
      .select("id")
      .single();
    if (skuFbErr || !skuFb) return steps;
    skuId = skuFb.id;
  }

  const stepRows = steps.map((s, i) => {
    const { start_time, end_time } = clipBounds(steps, i, params.durationSec);
    return {
      sku_id: skuId!,
      step_number: s.step_number,
      step_name: s.title,
      description: s.description,
      youtube_url: youtubeUrl,
      start_time,
      end_time
    };
  });

  const { data: inserted, error: stepErr } = await supabase
    .from("steps")
    .insert(stepRows)
    .select("id,step_number");

  if (stepErr || !inserted?.length) return steps;

  const idByNumber = new Map(
    inserted.map((r) => [Number(r.step_number), String(r.id)])
  );

  return steps.map((s, i) => {
    const bounds = clipBounds(steps, i, params.durationSec);
    return {
      ...s,
      id: idByNumber.get(s.step_number) ?? s.id,
      start_time: bounds.start_time,
      end_time: bounds.end_time
    };
  });
}
