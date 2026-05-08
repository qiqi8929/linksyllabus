"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { activateSkuFromCheckoutSession } from "@/lib/stripe/skuActivation";
import { getStripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";
import {
  FREE_TIER_UPGRADE_MESSAGE,
  maxAllowedGuides
} from "@/lib/freeTier";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  logUsersQueryAfter,
  logUsersQueryBefore,
  logUsersUpdateAfter,
  logUsersUpdateBefore,
  logUsersUpsertAfter,
  logUsersUpsertBefore
} from "@/lib/supabaseUsersQueryLog";

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

function logSupabaseOpError(label: string, userId: string, err: unknown): void {
  const e = err as { code?: string; message?: string; details?: string; hint?: string } | null;
  console.error("[dashboard/serverActions] supabase op failed", {
    label,
    userId,
    code: e?.code,
    message: e?.message,
    details: e?.details,
    hint: e?.hint
  });
}

function formatSupabaseError(err: unknown): string {
  const e = err as { code?: string; message?: string; details?: string; hint?: string } | null;
  if (!e) return "Unknown Supabase error";
  const parts = [
    e.code ? `code=${e.code}` : null,
    e.message ? `message=${e.message}` : null,
    e.details ? `details=${e.details}` : null,
    e.hint ? `hint=${e.hint}` : null
  ].filter(Boolean);
  return parts.join(" | ") || "Unknown Supabase error";
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

export type CreateInactiveSkuWithStepsResult =
  | { ok: true; skuId: string; checkoutRequired: boolean }
  | {
      ok: false;
      message: string;
      kind?: "auth" | "validation" | "guide_limit" | "schema";
    };

const SCHEMA_MISSING_PAID_SLOTS_MESSAGE =
  "Database setup incomplete: Supabase is missing usage columns (paid_guide_slots / guide_count). Run the SQL migrations from the repo supabase/ folder on your project, then reload.";

/**
 * Creates an inactive tutorial and all steps in one transaction (via sequential inserts).
 * User completes Stripe checkout; webhook sets `skus.is_active = true`.
 *
 * Returns `{ ok: false }` for expected failures so the client can show a message without a 500.
 */
export async function createInactiveSkuWithSteps(payload: {
  tutorialName: string;
  steps: TutorialStepInput[];
  /** When a step has no per-step URL, use this (chapter YouTube URL from the form). */
  defaultYoutubeUrl?: string;
  materialsText?: string;
  toolsText?: string;
}): Promise<CreateInactiveSkuWithStepsResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Sign in to create a tutorial.", kind: "auth" };
  }

  const name = payload.tutorialName.trim();
  if (!name) {
    return { ok: false, message: "Tutorial name is required.", kind: "validation" };
  }
  if (!payload.steps.length) {
    return { ok: false, message: "Add at least one step.", kind: "validation" };
  }

  if (!user.id) {
    return { ok: false, message: "Missing user id.", kind: "validation" };
  }

  const defaultYoutubeUrl = String(payload.defaultYoutubeUrl ?? "").trim();

  /** Server actions may strip `undefined`; missing keys become NULL on insert — coerce everything. */
  const normalized: {
    step_number: number;
    step_name: string;
    description: string;
    youtube_url: string;
    start_time: number;
    end_time: number;
  }[] = [];
  for (let idx = 0; idx < payload.steps.length; idx++) {
    const s = payload.steps[idx];
    const step_name = String(s.step_name ?? "").trim();
    const description = String(s.description ?? "").trim();
    const youtube_url =
      String(s.youtube_url ?? "").trim() || defaultYoutubeUrl;
    const startRaw = Number(s.start_time);
    const endRaw = Number(s.end_time);
    const start_time = Math.max(0, Math.floor(Number.isFinite(startRaw) ? startRaw : 0));
    const end_time = Math.floor(endRaw);

    if (!step_name || !youtube_url) {
      return {
        ok: false,
        message: `Step ${idx + 1}: name and video URL are required.`,
        kind: "validation"
      };
    }
    if (
      !Number.isFinite(endRaw) ||
      !Number.isFinite(end_time) ||
      end_time <= start_time
    ) {
      return {
        ok: false,
        message: `Step ${idx + 1}: end time (seconds) must be greater than start time.`,
        kind: "validation"
      };
    }

    normalized.push({
      step_number: idx + 1,
      step_name,
      description,
      youtube_url,
      start_time,
      end_time
    });
  }

  // Ensure user row exists first; avoid selecting migration-sensitive columns here.
  logUsersUpsertBefore({
    context: "createInactiveSkuWithSteps.users.upsert",
    userId: user.id,
    fields: ["id", "email"]
  });
  const { error: upsertUserError } = await supabase
    .from("users")
    .upsert({ id: user.id, email: user.email ?? null }, { onConflict: "id" });
  logUsersUpsertAfter({
    context: "createInactiveSkuWithSteps.users.upsert",
    userId: user.id,
    ok: !upsertUserError,
    error: upsertUserError
  });
  if (upsertUserError) {
    logSupabaseOpError("users.upsert", user.id, upsertUserError);
  }

  // Usage source-of-truth for unlocks:
  // - paid_guide_slots controls purchased capacity
  // - actual created tutorials come from skus count
  // guide_count is display-only and should not gate creation.
  let paidSlots = 0;
  /** Set when admin fallback runs (used to detect missing DB columns vs RLS-only failures). */
  let adminPaidSlotsErr:
    | { code?: string; message?: string; details?: string; hint?: string }
    | undefined;

  logUsersQueryBefore({
    context: "createInactiveSkuWithSteps.paid_guide_slots",
    userId: user.id,
    columns: "paid_guide_slots"
  });
  const { data: paidRow, error: paidErr } = await supabase
    .from("users")
    .select("paid_guide_slots")
    .eq("id", user.id)
    .maybeSingle();
  logUsersQueryAfter({
    context: "createInactiveSkuWithSteps.paid_guide_slots",
    userId: user.id,
    columns: "paid_guide_slots",
    ok: !paidErr,
    error: paidErr,
    rowReturned: paidRow != null
  });
  if (!paidErr && paidRow) {
    const ps = Number(paidRow.paid_guide_slots);
    if (Number.isFinite(ps) && ps >= 0) paidSlots = ps;
  } else if (paidErr) {
    logUsersUsageSelectError({
      label: "paid_guide_slots",
      userId: user.id,
      err: paidErr,
      fallback: "retry admin read paid_guide_slots"
    });
    const admin = createSupabaseAdminClient();
    logUsersQueryBefore({
      context: "createInactiveSkuWithSteps.paid_guide_slots.admin",
      userId: user.id,
      columns: "paid_guide_slots"
    });
    const { data: adminPaid, error: adminPaidErr } = await admin
      .from("users")
      .select("paid_guide_slots")
      .eq("id", user.id)
      .maybeSingle();
    adminPaidSlotsErr = adminPaidErr ?? undefined;
    logUsersQueryAfter({
      context: "createInactiveSkuWithSteps.paid_guide_slots.admin",
      userId: user.id,
      columns: "paid_guide_slots",
      ok: !adminPaidErr,
      error: adminPaidErr,
      rowReturned: adminPaid != null
    });
    if (!adminPaidErr && adminPaid) {
      const ps = Number(adminPaid.paid_guide_slots);
      if (Number.isFinite(ps) && ps >= 0) paidSlots = ps;
    } else if (adminPaidErr) {
      logSupabaseOpError("users.paid_guide_slots admin fallback", user.id, adminPaidErr);
    }
  }

  let createdGuides = 0;
  const { count: skuCount, error: skuCountError } = await supabase
    .from("skus")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (skuCountError) {
    logSupabaseOpError("skus.count_for_guide_limit", user.id, skuCountError);
  } else {
    createdGuides = Math.max(0, Number(skuCount ?? 0));
  }

  const maxGuides = maxAllowedGuides(paidSlots);
  if (createdGuides >= maxGuides) {
    const paidSlotsColumnMissing =
      paidErr != null &&
      adminPaidSlotsErr != null &&
      isUsersUsageColumnMissing(paidErr) &&
      isUsersUsageColumnMissing(adminPaidSlotsErr);
    if (paidSlotsColumnMissing) {
      return {
        ok: false,
        message: SCHEMA_MISSING_PAID_SLOTS_MESSAGE,
        kind: "schema"
      };
    }
    return {
      ok: false,
      message: FREE_TIER_UPGRADE_MESSAGE,
      kind: "guide_limit"
    };
  }

  const materialsText = String(payload.materialsText ?? "").trim();
  const toolsText = String(payload.toolsText ?? "").trim();

  const skuInsertFull = {
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
  };
  const skuInsertFallback = {
    user_id: user.id,
    name,
    description: "",
    scan_count: 0,
    is_active: true
  };

  let sku: { id: string } | null = null;
  {
    const { data: firstSku, error: firstErr } = await supabase
      .from("skus")
      .insert(skuInsertFull)
      .select("id")
      .single();
    if (!firstErr && firstSku) {
      sku = firstSku;
    } else if (firstErr) {
      logSupabaseOpError("skus.insert_full", user.id, firstErr);
      const merged = `${String((firstErr as any).message ?? "")}\n${String(
        (firstErr as any).details ?? ""
      )}`.toLowerCase();
      const canRetryWithFallback =
        merged.includes("materials_text") ||
        merged.includes("tools_text") ||
        merged.includes("youtube_url") ||
        merged.includes("start_time") ||
        merged.includes("end_time");
      if (canRetryWithFallback) {
        const { data: fallbackSku, error: fallbackErr } = await supabase
          .from("skus")
          .insert(skuInsertFallback)
          .select("id")
          .single();
        if (!fallbackErr && fallbackSku) {
          sku = fallbackSku;
        } else {
          logSupabaseOpError("skus.insert_fallback", user.id, fallbackErr);
          throw new Error(
            `[createInactiveSkuWithSteps] Failed to create tutorial row (fallback): ${formatSupabaseError(
              fallbackErr
            )}`
          );
        }
      } else {
        throw new Error(
          `[createInactiveSkuWithSteps] Failed to create tutorial row: ${formatSupabaseError(
            firstErr
          )}`
        );
      }
    }
  }

  if (!sku) {
    throw new Error("Failed to create tutorial (missing sku id after insert).");
  }

  logUsersUpdateBefore({
    context: "createInactiveSkuWithSteps.guide_count_bump",
    userId: user.id,
    patch: { guide_count: createdGuides + 1 }
  });
  const { error: bumpGuideCountError } = await supabase
    .from("users")
    .update({ guide_count: createdGuides + 1 })
    .eq("id", user.id);
  logUsersUpdateAfter({
    context: "createInactiveSkuWithSteps.guide_count_bump",
    userId: user.id,
    ok: !bumpGuideCountError,
    error: bumpGuideCountError
  });
  if (bumpGuideCountError) {
    // Tutorial is already created; avoid hard failure on usage-counter write issues.
    logSupabaseOpError("users.update_guide_count", user.id, bumpGuideCountError);
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
    logSupabaseOpError("steps.insert", user.id, stepErr);
    throw new Error(
      `[createInactiveSkuWithSteps] Failed to create tutorial steps: ${formatSupabaseError(
        stepErr
      )}`
    );
  }

  return { ok: true, skuId: sku.id, checkoutRequired: false };
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

  logUsersQueryBefore({
    context: "deleteSkuAction.guide_count_read",
    userId: user.id,
    columns: "guide_count"
  });
  const { data: userRow, error: guideReadErr } = await supabase
    .from("users")
    .select("guide_count")
    .eq("id", user.id)
    .maybeSingle();
  logUsersQueryAfter({
    context: "deleteSkuAction.guide_count_read",
    userId: user.id,
    columns: "guide_count",
    ok: !guideReadErr,
    error: guideReadErr,
    rowReturned: userRow != null
  });
  const currentGuideCount = Math.max(0, Number(userRow?.guide_count ?? 0));
  const nextGuideCount = Math.max(0, currentGuideCount - 1);
  logUsersUpdateBefore({
    context: "deleteSkuAction.guide_count_decrement",
    userId: user.id,
    patch: { guide_count: nextGuideCount }
  });
  const { error: guideCountError } = await supabase
    .from("users")
    .update({ guide_count: nextGuideCount })
    .eq("id", user.id);
  logUsersUpdateAfter({
    context: "deleteSkuAction.guide_count_decrement",
    userId: user.id,
    ok: !guideCountError,
    error: guideCountError
  });
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
