"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOutAction() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export type TutorialStepInput = {
  step_name: string;
  description: string;
  /** Stored in `steps.youtube_url`; may be YouTube or Vimeo. */
  youtube_url: string;
  start_time: number;
  end_time: number;
};

/**
 * Creates an inactive tutorial and all steps in one transaction (via sequential inserts).
 * User completes Stripe checkout; webhook sets `skus.is_active = true`.
 */
export async function createInactiveSkuWithSteps(payload: {
  tutorialName: string;
  steps: TutorialStepInput[];
}): Promise<{ skuId: string }> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const name = payload.tutorialName.trim();
  if (!name) {
    throw new Error("Tutorial name is required.");
  }
  if (!payload.steps.length) {
    throw new Error("Add at least one step.");
  }

  for (let i = 0; i < payload.steps.length; i++) {
    const s = payload.steps[i];
    if (!s.step_name.trim() || !s.youtube_url.trim()) {
      throw new Error(`Step ${i + 1}: name and video URL are required.`);
    }
    if (
      !Number.isFinite(s.start_time) ||
      !Number.isFinite(s.end_time) ||
      s.end_time <= s.start_time
    ) {
      throw new Error(
        `Step ${i + 1}: end time (seconds) must be greater than start time.`
      );
    }
  }

  await supabase.from("users").upsert({ id: user.id, email: user.email });

  const { data: sku, error: skuErr } = await supabase
    .from("skus")
    .insert({
      user_id: user.id,
      name,
      description: "",
      is_active: false
    })
    .select("id")
    .single();

  if (skuErr || !sku) {
    throw skuErr ?? new Error("Failed to create tutorial.");
  }

  const rows = payload.steps.map((s, idx) => ({
    sku_id: sku.id,
    step_number: idx + 1,
    step_name: s.step_name.trim(),
    description: s.description.trim(),
    youtube_url: s.youtube_url.trim(),
    start_time: Math.max(0, Math.floor(s.start_time)),
    end_time: Math.floor(s.end_time)
  }));

  const { error: stepErr } = await supabase.from("steps").insert(rows);
  if (stepErr) {
    throw stepErr;
  }

  return { skuId: sku.id };
}
