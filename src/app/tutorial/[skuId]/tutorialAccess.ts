import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * RLS: inactive SKUs are visible only to the owner; active SKUs to anyone.
 */
export async function fetchSkuVisibleToViewer(skuId: string) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: sku, error } = await supabase
    .from("skus")
    .select("id,name,description,is_active,user_id")
    .eq("id", skuId)
    .maybeSingle();

  if (error || !sku) {
    return { supabase, sku: null, user: user ?? null };
  }

  if (!sku.is_active && user?.id !== sku.user_id) {
    return { supabase, sku: null, user: user ?? null };
  }

  return { supabase, sku, user: user ?? null };
}
