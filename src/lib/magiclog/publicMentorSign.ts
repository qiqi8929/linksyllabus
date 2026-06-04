import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signatureBucketForUpload } from "@/lib/magiclog/signatureStorage";
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

/** Storage path: {userId}/{workOrderId}/mentor.png — must match MagicLog mentorSignaturePath + RPC. */
export function publicMentorSignaturePath(userId: string, workOrderId: string): string {
  return `${userId}/${workOrderId}/mentor.png`;
}

function isExpectedMentorSignaturePath(
  path: string,
  userId: string,
  workOrderId: string
): boolean {
  return path === publicMentorSignaturePath(userId, workOrderId);
}

const WORK_ORDER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ORDER_SELECT_BASE =
  "id,task_name,competence_name,hours,status,user_id,period,competence_type,signed_at,video_urls";

type OrderRow = {
  id: string;
  task_name: string | null;
  competence_name: string;
  hours: number | null;
  status: string;
  user_id: string;
  period: number;
  competence_type: string;
  signed_at: string | null;
  video_urls: unknown;
  signing_token?: string | null;
};

async function fetchOrderRow(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  workOrderId: string
): Promise<{ order: OrderRow | null; error: { message: string } | null }> {
  const withToken = await admin
    .from(MAGICLOG_WORK_ORDERS_TABLE)
    .select(`${ORDER_SELECT_BASE},signing_token`)
    .eq("id", workOrderId)
    .maybeSingle();

  if (!withToken.error && withToken.data) {
    return { order: withToken.data as OrderRow, error: null };
  }

  const missingColumn =
    withToken.error?.message?.toLowerCase().includes("signing_token") ?? false;

  if (withToken.error && !missingColumn) {
    console.error("[loadPublicSignWorkOrder] select error", withToken.error);
    return { order: null, error: { message: withToken.error.message } };
  }

  const fallback = await admin
    .from(MAGICLOG_WORK_ORDERS_TABLE)
    .select(ORDER_SELECT_BASE)
    .eq("id", workOrderId)
    .maybeSingle();

  if (fallback.error) {
    console.error("[loadPublicSignWorkOrder] select fallback error", fallback.error);
    return { order: null, error: { message: fallback.error.message } };
  }

  return { order: (fallback.data as OrderRow | null) ?? null, error: null };
}

function mapOrderRow(order: OrderRow): PublicSignWorkOrder {
  return {
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
}

async function loadApprentice(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
): Promise<PublicSignApprentice> {
  const { data: userRow } = await admin
    .from("users")
    .select("email,ait_id,sponsor_name")
    .eq("id", userId)
    .maybeSingle();

  return {
    displayName: apprenticeDisplayName({
      email: userRow?.email ?? null,
      ait_id: userRow?.ait_id ?? null,
      sponsor_name: userRow?.sponsor_name ?? null
    })
  };
}

type RpcSigningRow = {
  work_order_id: string;
  task_name: string | null;
  competence_name: string;
  hours: number | null;
  user_id: string;
  status: string;
};

/** Load work order for public mentor sign page (same token rules as MagicLog app RPC). */
export async function loadPublicSignWorkOrder(
  workOrderId: string,
  token: string | null | undefined
): Promise<PublicSignLoadResult> {
  const id = workOrderId?.trim();
  const tokenTrimmed = token?.trim();

  if (!id || !WORK_ORDER_ID_RE.test(id)) {
    return { kind: "invalid", message: "Invalid signing link." };
  }

  if (!tokenTrimmed) {
    return { kind: "invalid", message: "This signing link is missing a token." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (err: unknown) {
    console.error("[loadPublicSignWorkOrder] admin client", err);
    return {
      kind: "invalid",
      message: "Signing service is not configured. Contact support."
    };
  }

  const { data: rpcData, error: rpcErr } = await admin.rpc("get_work_order_for_signing", {
    p_work_order_id: id,
    p_token: tokenTrimmed
  });

  const { order: row, error: selectErr } = await fetchOrderRow(admin, id);

  if (rpcErr) {
    const rpcMsg = rpcErr.message ?? "";
    console.error("[loadPublicSignWorkOrder] RPC error", rpcErr);

    if (row?.status === "signed") {
      const apprentice = await loadApprentice(admin, row.user_id);
      return { kind: "already_signed", order: mapOrderRow(row), apprentice };
    }

    if (!row) {
      if (selectErr?.message?.includes("JWT") || rpcMsg.toLowerCase().includes("jwt")) {
        return {
          kind: "invalid",
          message: "Signing service configuration error. Check Supabase keys on Vercel."
        };
      }
      return { kind: "invalid", message: "Work order not found." };
    }

    if (rpcMsg.toLowerCase().includes("already signed")) {
      const apprentice = await loadApprentice(admin, row.user_id);
      return { kind: "already_signed", order: mapOrderRow(row), apprentice };
    }

    if (rpcMsg.toLowerCase().includes("expired")) {
      return { kind: "invalid", message: "This signing link has expired." };
    }

    const columnToken =
      typeof row.signing_token === "string" ? row.signing_token.trim() : null;
    if (columnToken === tokenTrimmed || isTokenValid(extractSigningMeta(row.video_urls), tokenTrimmed)) {
      const apprentice = await loadApprentice(admin, row.user_id);
      return { kind: "ok", order: mapOrderRow(row), apprentice };
    }

    return { kind: "invalid", message: "This signing link is invalid or has expired." };
  }

  const rpcRow = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as RpcSigningRow | null;
  if (!rpcRow?.work_order_id) {
    return { kind: "invalid", message: "This signing link is invalid or has expired." };
  }

  if (row) {
    const apprentice = await loadApprentice(admin, row.user_id);
    return { kind: "ok", order: mapOrderRow(row), apprentice };
  }

  const apprentice = await loadApprentice(admin, rpcRow.user_id);
  const workOrder: PublicSignWorkOrder = {
    id: rpcRow.work_order_id,
    task_name: rpcRow.task_name,
    competence_name: rpcRow.competence_name,
    hours: rpcRow.hours != null ? Number(rpcRow.hours) : null,
    status: rpcRow.status as WorkOrderStatus,
    user_id: rpcRow.user_id,
    period: 1,
    competence_type: "mandatory",
    signed_at: null
  };

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
  const order = loaded.order;
  const storagePath = publicMentorSignaturePath(order.user_id, workOrderId);
  const bucket = signatureBucketForUpload();

  if (!isExpectedMentorSignaturePath(storagePath, order.user_id, workOrderId)) {
    return { ok: false, message: "Internal error: invalid mentor signature path." };
  }

  const { error: uploadErr } = await admin.storage.from(bucket).upload(storagePath, pngBytes, {
    contentType: "image/png",
    upsert: true
  });

  if (uploadErr) {
    return { ok: false, message: uploadErr.message || "Failed to upload signature." };
  }

  const { data: uploaded, error: verifyErr } = await admin.storage.from(bucket).download(storagePath);

  if (verifyErr || !uploaded || uploaded.size === 0) {
    console.error("[completePublicMentorSign] verify upload:", verifyErr?.message ?? "empty file");
    return { ok: false, message: "Signature upload could not be verified." };
  }

  const { error: rpcErr } = await admin.rpc("complete_work_order_signing_with_token", {
    p_work_order_id: workOrderId,
    p_token: token,
    p_signature_path: storagePath
  });

  if (rpcErr) {
    console.error("[completePublicMentorSign] RPC failed", rpcErr);
    return {
      ok: false,
      message:
        rpcErr.message ||
        "Failed to complete signing. Ensure Supabase migration_token_signing_rpc.sql is applied."
    };
  }

  const { data: saved, error: readErr } = await admin
    .from(MAGICLOG_WORK_ORDERS_TABLE)
    .select("status, mentor_signature_url")
    .eq("id", workOrderId)
    .maybeSingle();

  if (readErr || saved?.status !== "signed" || saved?.mentor_signature_url !== storagePath) {
    console.error("[completePublicMentorSign] read-back", readErr, saved);
    return { ok: false, message: "Signature was saved but work order could not be confirmed." };
  }

  return { ok: true };
}
