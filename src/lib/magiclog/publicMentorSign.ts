import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signatureBucketForUpload } from "@/lib/magiclog/signatureStorage";
import { applySignedWorkOrderToProgress } from "@/lib/magiclog/periodProgress";
import { fetchMagicLogProfile } from "@/lib/magiclog/profile";
import { MAGICLOG_WORK_ORDERS_TABLE } from "@/lib/magiclog/tables";
import type { CompetenceType, WorkOrderStatus } from "@/lib/magiclog/types";

export type PublicSignWorkOrder = {
  id: string;
  task_name: string | null;
  competence_name: string;
  hours: number | null;
  status: WorkOrderStatus;
  user_id: string;
  period: number;
  competence_type: CompetenceType;
  signed_at: string | null;
};

export type PublicSignApprentice = {
  displayName: string;
};

export type PublicSignLoadResult =
  | { kind: "ok"; order: PublicSignWorkOrder; apprentice: PublicSignApprentice }
  | { kind: "already_signed"; order: PublicSignWorkOrder; apprentice: PublicSignApprentice }
  | { kind: "invalid"; message: string };

type SigningMeta = {
  token: string | null;
  expires: string | null;
};

function extractSigningMeta(videoUrls: unknown): SigningMeta {
  if (!Array.isArray(videoUrls)) return { token: null, expires: null };

  for (const row of videoUrls) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const token =
      typeof record.signingToken === "string"
        ? record.signingToken
        : typeof record.signing_token === "string"
          ? record.signing_token
          : null;
    if (!token) continue;
    const expires =
      typeof record.signingTokenExpires === "string"
        ? record.signingTokenExpires
        : typeof record.signing_token_expires === "string"
          ? record.signing_token_expires
          : null;
    return { token, expires };
  }

  return { token: null, expires: null };
}

function isTokenValid(meta: SigningMeta, token: string | null | undefined): boolean {
  if (!token?.trim()) return false;
  if (!meta.token || meta.token !== token.trim()) return false;
  if (meta.expires) {
    const exp = new Date(meta.expires);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) return false;
  }
  return true;
}

function apprenticeDisplayName(profile: {
  email: string | null;
  ait_id: string | null;
  sponsor_name: string | null;
}): string {
  if (profile.ait_id?.trim()) return profile.ait_id.trim();
  const email = profile.email?.trim();
  if (email) {
    const local = email.split("@")[0];
    if (local) return local;
  }
  return "Apprentice";
}

/** Storage object path inside `bluebook-signatures`. */
export function publicMentorSignaturePath(workOrderId: string): string {
  return `${workOrderId}/mentor.png`;
}

export async function loadPublicSignWorkOrder(
  workOrderId: string,
  token: string | null | undefined
): Promise<PublicSignLoadResult> {
  if (!workOrderId?.trim()) {
    return { kind: "invalid", message: "Invalid signing link." };
  }

  const admin = createSupabaseAdminClient();

  const { data: order, error } = await admin
    .from(MAGICLOG_WORK_ORDERS_TABLE)
    .select(
      "id,task_name,competence_name,hours,status,user_id,period,competence_type,signed_at,video_urls,signing_token"
    )
    .eq("id", workOrderId)
    .maybeSingle();

  if (error || !order) {
    return { kind: "invalid", message: "Work order not found." };
  }

  const { data: userRow } = await admin
    .from("users")
    .select("email,ait_id,sponsor_name")
    .eq("id", order.user_id)
    .maybeSingle();

  const apprentice: PublicSignApprentice = {
    displayName: apprenticeDisplayName({
      email: userRow?.email ?? null,
      ait_id: userRow?.ait_id ?? null,
      sponsor_name: userRow?.sponsor_name ?? null
    })
  };

  const workOrder: PublicSignWorkOrder = {
    id: order.id,
    task_name: order.task_name,
    competence_name: order.competence_name,
    hours: order.hours != null ? Number(order.hours) : null,
    status: order.status as WorkOrderStatus,
    user_id: order.user_id,
    period: order.period,
    competence_type: order.competence_type as CompetenceType,
    signed_at: order.signed_at
  };

  if (order.status === "signed") {
    return { kind: "already_signed", order: workOrder, apprentice };
  }

  const columnToken =
    typeof order.signing_token === "string" ? order.signing_token.trim() : null;
  if (columnToken && token?.trim() === columnToken) {
    return { kind: "ok", order: workOrder, apprentice };
  }

  const meta = extractSigningMeta(order.video_urls);
  if (!isTokenValid(meta, token)) {
    return { kind: "invalid", message: "This signing link is invalid or has expired." };
  }

  return { kind: "ok", order: workOrder, apprentice };
}

export async function completePublicMentorSign(
  workOrderId: string,
  token: string,
  pngBytes: Buffer
): Promise<{ ok: true } | { ok: false; message: string }> {
  const loaded = await loadPublicSignWorkOrder(workOrderId, token);
  if (loaded.kind === "invalid") return { ok: false, message: loaded.message };
  if (loaded.kind === "already_signed") {
    return { ok: false, message: "This work order is already signed." };
  }

  const admin = createSupabaseAdminClient();
  const path = publicMentorSignaturePath(workOrderId);
  const bucket = signatureBucketForUpload();

  const { error: uploadErr } = await admin.storage.from(bucket).upload(path, pngBytes, {
    contentType: "image/png",
    upsert: true
  });

  if (uploadErr) {
    return { ok: false, message: uploadErr.message || "Failed to upload signature." };
  }

  const signedAt = new Date().toISOString();
  const order = loaded.order;

  const { error: updateErr } = await admin
    .from(MAGICLOG_WORK_ORDERS_TABLE)
    .update({
      status: "signed",
      signed_at: signedAt,
      mentor_signature_url: path
    })
    .eq("id", workOrderId);

  if (updateErr) {
    return { ok: false, message: updateErr.message || "Failed to save signature." };
  }

  const hours = order.hours;
  if (hours != null && Number.isFinite(hours) && hours > 0) {
    await admin.from("hour_logs").insert({
      user_id: order.user_id,
      work_order_id: workOrderId,
      hours,
      period: order.period
    });

    const profile = await fetchMagicLogProfile(admin, order.user_id);
    await applySignedWorkOrderToProgress(admin, {
      userId: order.user_id,
      period: order.period,
      hours,
      competenceType: order.competence_type,
      profile
    });
  }

  return { ok: true };
}
