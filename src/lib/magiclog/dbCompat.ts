import type { SupabaseClient } from "@supabase/supabase-js";

const WORK_ORDER_TABLES = ["magiclog_work_orders", "bluebook_work_orders"] as const;

function isMissingTableError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("schema cache") ||
    m.includes("42p01")
  );
}

/** Query work orders using magiclog_* or legacy bluebook_* table name. */
export async function queryWorkOrders<T>(
  supabase: SupabaseClient,
  run: (
    table: string
  ) => PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<{ data: T | null; error: { message: string } | null }> {
  let last = await run(WORK_ORDER_TABLES[0]);
  if (!last.error) return last;

  if (isMissingTableError(last.error.message)) {
    last = await run(WORK_ORDER_TABLES[1]);
    if (!last.error) return last;
  }

  return last;
}
