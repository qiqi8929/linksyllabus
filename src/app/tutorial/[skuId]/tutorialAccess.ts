import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Marketing demo: this SKU is readable by anyone even when `is_active` is false
 * (RLS would otherwise hide unpublished tutorials from anonymous visitors).
 * Override with `NEXT_PUBLIC_PUBLIC_DEMO_SKU_ID` (empty string = disable).
 */
const DEFAULT_PUBLIC_DEMO_SKU_ID = "f5594e00-f2ef-4d16-994f-702657c0de8e";

function getPublicDemoSkuId(): string | null {
  const v = process.env.NEXT_PUBLIC_PUBLIC_DEMO_SKU_ID;
  if (v !== undefined && v.trim() === "") return null;
  if (v != null && v.trim() !== "") return v.trim();
  return DEFAULT_PUBLIC_DEMO_SKU_ID;
}

/** True when this id is the configured public demo (shown on homepage, etc.). */
export function isPublicDemoSkuId(skuId: string): boolean {
  const demo = getPublicDemoSkuId();
  return demo != null && skuId === demo;
}

/**
 * RLS: inactive SKUs are visible only to the owner; active SKUs to anyone.
 * The public demo SKU bypasses that for anonymous users so the marketing link works before publish.
 */
export async function fetchSkuVisibleToViewer(skuId: string) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (isPublicDemoSkuId(skuId)) {
    const admin = createSupabaseAdminClient();
    // Use * so production DBs without print-branding columns still work (no failed select).
    const { data: sku, error } = await admin
      .from("skus")
      .select("*")
      .eq("id", skuId)
      .maybeSingle();

    if (error || !sku) {
      return { supabase, sku: null, user: user ?? null };
    }
    return { supabase: admin, sku, user: user ?? null };
  }

  const { data: sku, error } = await supabase
    .from("skus")
    .select("*")
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

const TUTORIAL_STEP_COLUMNS =
  "id,step_number,step_name,description,youtube_url,start_time,end_time,sku_id";

/**
 * Step rows for `/tutorial` and `/tutorial/.../print`.
 *
 * For **published** tutorials (`is_active`) and the **public demo** SKU, load via
 * the service role so anonymous visitors get the same rows as the owner (RLS
 * cannot hide or filter steps for public links). Draft tutorials use the server
 * client so only the owner sees steps.
 */
export async function fetchTutorialSteps(
  skuId: string,
  sku: { is_active: boolean; user_id: string }
) {
  if (isPublicDemoSkuId(skuId)) {
    const admin = createSupabaseAdminClient();
    return admin
      .from("steps")
      .select(TUTORIAL_STEP_COLUMNS)
      .eq("sku_id", skuId)
      .order("step_number", { ascending: true });
  }

  if (sku.is_active) {
    const admin = createSupabaseAdminClient();
    return admin
      .from("steps")
      .select(TUTORIAL_STEP_COLUMNS)
      .eq("sku_id", skuId)
      .order("step_number", { ascending: true });
  }

  const supabase = createSupabaseServerClient();
  return supabase
    .from("steps")
    .select(TUTORIAL_STEP_COLUMNS)
    .eq("sku_id", skuId)
    .order("step_number", { ascending: true });
}
