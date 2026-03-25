import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function createSupabaseAdminClient() {
  return createClient(env.supabase.url(), env.supabase.serviceRoleKey(), {
    auth: { persistSession: false }
  });
}

