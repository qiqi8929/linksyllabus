import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

/** Optional users columns added in migration_magiclog_features / migration_users_profile_e2e.sql */
const OPTIONAL_USER_COLUMNS = [
  "default_mentor_phone",
  "default_mentor_name",
  "journeyman_certificate_number",
  "is_journeyman"
] as const;

export function isMissingUserColumnError(
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

function isOptionalColumnMissingError(
  error: PostgrestError | { message?: string } | null | undefined
): string | null {
  for (const col of OPTIONAL_USER_COLUMNS) {
    if (isMissingUserColumnError(error, col)) return col;
  }
  return null;
}

/** PATCH public.users; strips unmigrated optional columns and retries. */
export async function updateUserProfilePatch(
  supabase: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>
): Promise<{ error: PostgrestError | null }> {
  const current: Record<string, unknown> = { ...patch };

  for (let attempt = 0; attempt <= OPTIONAL_USER_COLUMNS.length; attempt += 1) {
    if (Object.keys(current).length === 0) {
      return { error: null };
    }

    const result = await supabase.from("users").update(current).eq("id", userId);
    if (!result.error) {
      return { error: null };
    }

    const missing = isOptionalColumnMissingError(result.error);
    if (missing && missing in current) {
      delete current[missing];
      continue;
    }

    return { error: result.error };
  }

  return { error: null };
}
