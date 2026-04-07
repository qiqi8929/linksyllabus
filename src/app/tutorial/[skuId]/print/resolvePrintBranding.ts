/**
 * Print manual creator / level — only tutorial fields on `skus`.
 * Never uses login email, username, or user handle (no account-based fallback).
 *
 * Priority: `creator_name` → `author` → placeholder "Creator".
 */
export function resolvePrintBranding(sku: {
  creator_name: string | null | undefined;
  author: string | null | undefined;
  level: string | null | undefined;
}): { displayCreatorName: string; displayLevel: string } {
  const displayCreatorName =
    sku.creator_name?.trim() || sku.author?.trim() || "Creator";

  const displayLevel = sku.level?.trim() || "General";

  return { displayCreatorName, displayLevel };
}
