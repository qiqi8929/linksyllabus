import type { SupabaseClient } from "@supabase/supabase-js";

/** DB / Storage bucket name (unchanged from Bluebook era). */
export const SIGNATURE_BUCKET = "bluebook-signatures";

const SIGNATURE_BUCKETS = [SIGNATURE_BUCKET, "magiclog-signatures"] as const;

/** Canonical storage object path for mentor web / in-app signatures. */
export function mentorSignatureStoragePath(userId: string, workOrderId: string): string {
  return `${userId}/${workOrderId}/mentor.png`;
}

/** All plausible storage keys for a mentor signature (legacy + canonical). */
export function mentorSignaturePathCandidates(
  storedPath: string | null | undefined,
  userId?: string | null,
  workOrderId?: string | null
): string[] {
  const out: string[] = [];
  const add = (p: string | null | undefined) => {
    const t = p?.trim();
    if (t && !out.includes(t)) out.push(t);
  };

  add(storedPath);
  if (userId && workOrderId) {
    add(mentorSignatureStoragePath(userId, workOrderId));
    add(`${userId}/${workOrderId}.png`);
    add(`${userId}/${workOrderId}.jpg`);
    add(`${workOrderId}/mentor.png`);
  }

  return out;
}

export async function createSignatureSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  for (const bucket of SIGNATURE_BUCKETS) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

/** Resolve signed URL for PDF/print export (tries canonical + legacy paths and buckets). */
export async function resolveMentorSignatureSignedUrl(
  supabase: SupabaseClient,
  storedPath: string | null | undefined,
  userId?: string | null,
  workOrderId?: string | null,
  expiresIn = 60 * 60
): Promise<string | null> {
  if (!storedPath?.trim()) return null;
  if (storedPath.startsWith("http")) return storedPath;

  for (const path of mentorSignaturePathCandidates(storedPath, userId, workOrderId)) {
    const url = await createSignatureSignedUrl(supabase, path, expiresIn);
    if (url) return url;
  }

  return null;
}

export function signatureBucketForUpload(): string {
  return SIGNATURE_BUCKET;
}
