"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { activateSkuFromCheckoutSession } from "@/lib/stripe/skuActivation";
import { getStripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";
import {
  FREE_GUIDE_LIMIT,
  FREE_TIER_UPGRADE_MESSAGE,
  maxAllowedGuides
} from "@/lib/freeTier";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isUsersUsageColumnMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  if (!e) return false;
  if (e.code === "42703" || e.code === "PGRST204") return true;
  const merged = `${String(e.message ?? "")}\n${String(e.details ?? "")}\n${String(e.hint ?? "")}`;
  return /guide_count|paid_guide_slots/i.test(merged);
}

function logUsersUsageSelectError(params: {
  label: "guide_count" | "paid_guide_slots";
  userId: string;
  err: unknown;
  fallback: string;
}): void {
  const e = params.err as { code?: string; message?: string; details?: string; hint?: string } | null;
  // Avoid logging any secrets; userId is fine.
  console.error("[dashboard/serverActions] users usage select failed", {
    label: params.label,
    userId: params.userId,
    code: e?.code,
    message: e?.message,
    details: e?.details,
    hint: e?.hint,
    fallback: params.fallback
  });
}

export async function signOutAction() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export type TutorialStepInput = {
  step_name: string;
  description: string;
  /** Stored in `steps.youtube_url`; may be YouTube/Vimeo URL, legacy ls-storage ref, or Stream video id. */
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
  materialsText?: string;
  toolsText?: string;
}): Promise<{ skuId: string; checkoutRequired: boolean }> {
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

  // Ensure user row exists first; avoid selecting migration-sensitive columns here.
  const { error: upsertUserError } = await supabase
    .from("users")
    .upsert({ id: user.id, email: user.email ?? null }, { onConflict: "id" });
  if (upsertUserError) {
    throw new Error("Could not prepare user profile.");
  }

  // Usage: guide_count + paid_guide_slots. Query separately so one missing column
  // does not turn the whole request into a 400.
  let guideCount = 0;
  let paidSlots = 0;

  const { data: guideRow, error: guideErr } = await supabase
    .from("users")
    .select("guide_count")
    .eq("id", user.id)
    .maybeSingle();
  if (!guideErr && guideRow) {
    const gc = Number(guideRow.guide_count);
    if (Number.isFinite(gc) && gc >= 0) guideCount = gc;
  } else {
    if (guideErr) {
      logUsersUsageSelectError({
        label: "guide_count",
        userId: user.id,
        err: guideErr,
        fallback: "count skus as guideCount"
      });
    }
    const { count: skuCount, error: skuCountError } = await supabase
      .from("skus")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (skuCountError) {
      throw new Error("Could not check tutorial usage.");
    }
    guideCount = Math.max(0, Number(skuCount ?? 0));
  }

  const { data: paidRow, error: paidErr } = await supabase
    .from("users")
    .select("paid_guide_slots")
    .eq("id", user.id)
    .maybeSingle();
  if (!paidErr && paidRow) {
    const ps = Number(paidRow.paid_guide_slots);
    if (Number.isFinite(ps) && ps >= 0) paidSlots = ps;
  } else if (paidErr) {
    logUsersUsageSelectError({
      label: "paid_guide_slots",
      userId: user.id,
      err: paidErr,
      fallback: "paidSlots=0"
    });
  }

  const maxGuides = maxAllowedGuides(paidSlots);
  if (guideCount >= maxGuides) {
    throw new Error(FREE_TIER_UPGRADE_MESSAGE);
  }

  const materialsText = String(payload.materialsText ?? "").trim();
  const toolsText = String(payload.toolsText ?? "").trim();

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
      is_active: true,
      materials_text: materialsText || null,
      tools_text: toolsText || null
    })
    .select("id")
    .single();

  if (skuErr || !sku) {
    throw skuErr ?? new Error("Failed to create tutorial.");
  }

  const { error: bumpGuideCountError } = await supabase
    .from("users")
    .update({ guide_count: guideCount + 1 })
    .eq("id", user.id);
  if (bumpGuideCountError && !isUsersUsageColumnMissing(bumpGuideCountError)) {
    throw bumpGuideCountError;
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

  return { skuId: sku.id, checkoutRequired: false };
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

  const { data: userRow } = await supabase
    .from("users")
    .select("guide_count")
    .eq("id", user.id)
    .maybeSingle();
  const currentGuideCount = Math.max(0, Number(userRow?.guide_count ?? 0));
  const { error: guideCountError } = await supabase
    .from("users")
    .update({ guide_count: Math.max(0, currentGuideCount - 1) })
    .eq("id", user.id);
  if (guideCountError && !isUsersUsageColumnMissing(guideCountError)) {
    throw new Error(guideCountError.message);
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

/**
 * If checkout succeeded but webhook never activated the SKU, find a paid Checkout Session
 * for this customer + tutorial and set `is_active` (same as webhook).
 */
export async function syncSkuActivationFromStripe(skuId: string) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Unauthorized");

  if (!env.stripe.secretKey()) {
    throw new Error("Stripe is not configured.");
  }

  const admin = createSupabaseAdminClient();
  const { data: sku } = await admin
    .from("skus")
    .select("id,is_active,user_id")
    .eq("id", skuId)
    .maybeSingle();

  if (!sku || sku.user_id !== user.id) {
    throw new Error("Tutorial not found.");
  }
  if (sku.is_active) {
    revalidatePath("/dashboard");
    revalidatePath(`/tutorial/${skuId}`);
    return;
  }

  const { data: subRow } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const customerId = subRow?.stripe_customer_id;
  if (!customerId) {
    throw new Error(
      "No Stripe customer yet. Use Activate to open checkout at least once."
    );
  }

  const stripe = getStripe();
  const sessions = await stripe.checkout.sessions.list({
    customer: customerId,
    limit: 100
  });

  const paid = sessions.data.find(
    (s) =>
      s.metadata?.type === "sku" &&
      s.metadata?.sku_id === skuId &&
      s.metadata?.user_id === user.id &&
      s.payment_status === "paid"
  );

  if (!paid) {
    throw new Error(
      "No paid Stripe checkout found for this tutorial. If you paid recently, wait a minute or use Activate again."
    );
  }

  await activateSkuFromCheckoutSession(paid);
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
    materialsText?: string;
    toolsText?: string;
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

  const materialsText = String(payload.materialsText ?? "").trim();
  const toolsText = String(payload.toolsText ?? "").trim();

  const { error: upSku } = await supabase
    .from("skus")
    .update({
      name,
      description: String(payload.description ?? "").trim(),
      materials_text: materialsText || null,
      tools_text: toolsText || null
    })
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
