import type { PostgrestError } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAGICLOG_WORK_ORDERS_TABLE } from "@/lib/magiclog/tables";

export function isMissingWorkOrderColumnError(
  error: PostgrestError | { message?: string } | null | undefined,
  column: string
): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  const col = column.toLowerCase();
  return (
    msg.includes(col) &&
    (msg.includes("schema cache") ||
      msg.includes("could not find") ||
      msg.includes("column") ||
      msg.includes("does not exist"))
  );
}

/** Persist signing link fields; degrades when signing_token_* columns are not migrated yet. */
export async function updateWorkOrderSigningLink(
  supabase: SupabaseClient,
  workOrderId: string,
  userId: string,
  patch: {
    video_urls: unknown;
    mentor_phone?: string | null;
    mentor_name?: string | null;
    signing_token: string;
    signing_token_expires: string;
  }
): Promise<{ error: PostgrestError | null }> {
  const full: Record<string, unknown> = {
    video_urls: patch.video_urls,
    signing_token: patch.signing_token,
    signing_token_expires: patch.signing_token_expires
  };
  if (patch.mentor_phone != null) full.mentor_phone = patch.mentor_phone;
  if (patch.mentor_name != null) full.mentor_name = patch.mentor_name;

  let result = await supabase
    .from(MAGICLOG_WORK_ORDERS_TABLE)
    .update(full)
    .eq("id", workOrderId)
    .eq("user_id", userId);

  if (
    result.error &&
    isMissingWorkOrderColumnError(result.error, "signing_token_expires")
  ) {
    const { signing_token_expires: _e, signing_token: _t, ...withoutExpiry } = full;
    result = await supabase
      .from(MAGICLOG_WORK_ORDERS_TABLE)
      .update({
        ...withoutExpiry,
        signing_token: patch.signing_token
      })
      .eq("id", workOrderId)
      .eq("user_id", userId);
  }

  if (result.error && isMissingWorkOrderColumnError(result.error, "signing_token")) {
    const minimal: Record<string, unknown> = { video_urls: patch.video_urls };
    if (patch.mentor_phone != null) minimal.mentor_phone = patch.mentor_phone;
    if (patch.mentor_name != null) minimal.mentor_name = patch.mentor_name;
    result = await supabase
      .from(MAGICLOG_WORK_ORDERS_TABLE)
      .update(minimal)
      .eq("id", workOrderId)
      .eq("user_id", userId);
  }

  return { error: result.error };
}

/** Mark work order signed and store mentor_signature_url; clears tokens when columns exist. */
export async function updateWorkOrderAfterMentorSign(
  supabase: SupabaseClient,
  workOrderId: string,
  storagePath: string,
  signedAt: string
): Promise<{ error: PostgrestError | null }> {
  const full = {
    status: "signed" as const,
    signed_at: signedAt,
    mentor_signature_url: storagePath,
    signing_token: null,
    signing_token_expires: null
  };

  let result = await supabase
    .from(MAGICLOG_WORK_ORDERS_TABLE)
    .update(full)
    .eq("id", workOrderId);

  if (
    result.error &&
    (isMissingWorkOrderColumnError(result.error, "signing_token_expires") ||
      isMissingWorkOrderColumnError(result.error, "signing_token"))
  ) {
    result = await supabase
      .from(MAGICLOG_WORK_ORDERS_TABLE)
      .update({
        status: "signed",
        signed_at: signedAt,
        mentor_signature_url: storagePath
      })
      .eq("id", workOrderId);
  }

  return { error: result.error };
}
