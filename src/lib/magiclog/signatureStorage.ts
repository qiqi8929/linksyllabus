import type { SupabaseClient } from "@supabase/supabase-js";

/** DB / Storage bucket name (unchanged from Bluebook era). */
export const SIGNATURE_BUCKET = "bluebook-signatures";

/** Resolve a mentor signature path (legacy magiclog-signatures bucket if present). */
export async function createSignatureSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  for (const bucket of [SIGNATURE_BUCKET, "magiclog-signatures"] as const) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

export function signatureBucketForUpload(): string {
  return SIGNATURE_BUCKET;
}

/** Canonical storage object path for mentor web / in-app signatures. */
export function mentorSignatureStoragePath(userId: string, workOrderId: string): string {
  return `${userId}/${workOrderId}/mentor.png`;
}
