"use server";

import { revalidatePath } from "next/cache";
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
  /** When a step has no per-step URL, use this (chapter YouTube URL from the form). */
  defaultYoutubeUrl?: string;
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

  if (!user.id) {
    throw new Error("Missing user id.");
  }

  const defaultYoutubeUrl = String(payload.defaultYoutubeUrl ?? "").trim();

  /** Server actions may strip `undefined`; missing keys become NULL on insert — coerce everything. */
  const normalized = payload.steps.map((s, idx) => {
    const step_name = String(s.step_name ?? "").trim();
    const description = String(s.description ?? "").trim();
    const youtube_url =
      String(s.youtube_url ?? "").trim() || defaultYoutubeUrl;
    const startRaw = Number(s.start_time);
    const endRaw = Number(s.end_time);
    const start_time = Math.max(0, Math.floor(Number.isFinite(startRaw) ? startRaw : 0));
    const end_time = Math.floor(endRaw);

    if (!step_name || !youtube_url) {
      throw new Error(`Step ${idx + 1}: name and video URL are required.`);
    }
    if (
      !Number.isFinite(endRaw) ||
      !Number.isFinite(end_time) ||
      end_time <= start_time
    ) {
      throw new Error(
        `Step ${idx + 1}: end time (seconds) must be greater than start time.`
      );
    }

    return {
      step_number: idx + 1,
      step_name,
      description,
      youtube_url,
      start_time,
      end_time
    };
  });

  await supabase.from("users").upsert({ id: user.id, email: user.email ?? null });

  const { data: sku, error: skuErr } = await supabase
    .from("skus")
    .insert({
      user_id: user.id,
      name,
      description: "",
      youtube_url: "",
      start_time: 0,
      end_time: 0,
      scan_count: 0,
      is_active: false
    })
    .select("id")
    .single();

  if (skuErr || !sku) {
    throw skuErr ?? new Error("Failed to create tutorial.");
  }

  const rows = normalized.map((r) => ({
    sku_id: sku.id,
    step_number: r.step_number,
    step_name: r.step_name,
    description: r.description,
    youtube_url: r.youtube_url,
    start_time: r.start_time,
    end_time: r.end_time
  }));

  const { error: stepErr } = await supabase.from("steps").insert(rows);
  if (stepErr) {
    throw stepErr;
  }

  return { skuId: sku.id };
}

export async function deleteSkuAction(skuId: string) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("skus")
    .delete()
    .eq("id", skuId)
    .eq("user_id", user.id)
    .select("id");

  if (error) throw new Error(error.message);

  if (!data?.length) {
    throw new Error(
      "Delete failed: no rows removed. In Supabase → SQL Editor, run the policy from supabase/migration_skus_delete_policy.sql (skus deletable by owner), then try again."
    );
  }

  revalidatePath("/dashboard");
}

export async function unpublishSkuAction(skuId: string) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("skus")
    .update({ is_active: false })
    .eq("id", skuId)
    .eq("user_id", user.id)
    .select("id");

  if (error) throw new Error(error.message);

  if (!data?.length) {
    throw new Error("Unpublish failed: no rows updated.");
  }

  revalidatePath("/dashboard");
  revalidatePath(`/tutorial/${skuId}`);
  revalidatePath(`/tutorial/${skuId}/print`);
}

export type TutorialStepUpdateInput = {
  id: string;
  step_name: string;
  description: string;
  youtube_url: string;
  start_time: number;
  end_time: number;
};

export async function updateTutorialAction(
  skuId: string,
  payload: {
    name: string;
    description: string;
    steps: TutorialStepUpdateInput[];
  }
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Unauthorized");

  const { data: sku, error: skuErr } = await supabase
    .from("skus")
    .select("id,user_id")
    .eq("id", skuId)
    .maybeSingle();

  if (skuErr || !sku || sku.user_id !== user.id) {
    throw new Error("Tutorial not found.");
  }

  const name = payload.name.trim();
  if (!name) throw new Error("Tutorial name is required.");

  const { error: upSku } = await supabase
    .from("skus")
    .update({ name, description: String(payload.description ?? "").trim() })
    .eq("id", skuId)
    .eq("user_id", user.id);

  if (upSku) throw new Error(upSku.message);

  const { data: stepRows } = await supabase
    .from("steps")
    .select("id")
    .eq("sku_id", skuId);

  const allowed = new Set((stepRows ?? []).map((r) => r.id));

  for (let i = 0; i < payload.steps.length; i++) {
    const s = payload.steps[i];
    if (!allowed.has(s.id)) {
      throw new Error(`Invalid step reference (step ${i + 1}).`);
    }
    const step_name = String(s.step_name ?? "").trim();
    const youtube_url = String(s.youtube_url ?? "").trim();
    if (!step_name || !youtube_url) {
      throw new Error(`Step ${i + 1}: name and video URL are required.`);
    }
    const startRaw = Number(s.start_time);
    const endRaw = Number(s.end_time);
    const start_time = Math.max(0, Math.floor(Number.isFinite(startRaw) ? startRaw : 0));
    const end_time = Math.floor(endRaw);
    if (!Number.isFinite(end_time) || end_time <= start_time) {
      throw new Error(
        `Step ${i + 1}: end time (seconds) must be greater than start time.`
      );
    }

    const { error: se } = await supabase
      .from("steps")
      .update({
        step_name,
        description: String(s.description ?? "").trim(),
        youtube_url,
        start_time,
        end_time
      })
      .eq("id", s.id)
      .eq("sku_id", skuId);

    if (se) throw new Error(se.message);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/tutorial/${skuId}`);
  revalidatePath(`/tutorial/${skuId}/print`);
}
