import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function displayNameFromEmailLocalPart(local: string): string {
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Resolves cover/footer creator label and level for the print manual.
 * Uses `creator_name` / `level` from `skus` when set; otherwise loads owner email
 * via service role (only on this server route) for a readable creator name.
 */
export async function resolvePrintBranding(sku: {
  user_id: string;
  creator_name: string | null | undefined;
  level: string | null | undefined;
}): Promise<{ displayCreatorName: string; displayLevel: string }> {
  let displayCreator = sku.creator_name?.trim() ?? "";
  if (!displayCreator) {
    const admin = createSupabaseAdminClient();
    const { data: u } = await admin
      .from("users")
      .select("email")
      .eq("id", sku.user_id)
      .maybeSingle();
    const email = u?.email?.trim();
    if (email) {
      const at = email.indexOf("@");
      const local = at > 0 ? email.slice(0, at) : email;
      displayCreator = displayNameFromEmailLocalPart(local) || local;
    }
  }
  if (!displayCreator) displayCreator = "Creator";

  const displayLevel = sku.level?.trim() || "General";

  return { displayCreatorName: displayCreator, displayLevel };
}
