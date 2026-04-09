import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { parseStorageVideoPath, TUTORIAL_VIDEO_BUCKET } from "@/lib/storageVideoUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Redirects to a short-lived signed URL for a step whose `youtube_url` points at
 * `ls-storage://tutorial-videos/...`. Allowed when the parent SKU is active or the viewer is the owner.
 */
export async function GET(req: Request) {
  const stepId = new URL(req.url).searchParams.get("stepId");
  if (!stepId) {
    return NextResponse.json({ error: "stepId is required." }, { status: 400 });
  }

  const supabase = createSupabaseRouteHandlerClient(req);
  const admin = createSupabaseAdminClient();

  const { data: stepRow, error: stepErr } = await admin
    .from("steps")
    .select("id, youtube_url, sku_id")
    .eq("id", stepId)
    .maybeSingle();

  if (stepErr || !stepRow?.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const objectPath = parseStorageVideoPath(stepRow.youtube_url);
  if (!objectPath) {
    return NextResponse.json({ error: "This step does not use an uploaded video." }, { status: 400 });
  }

  const { data: sku, error: skuErr } = await admin
    .from("skus")
    .select("id, is_active, user_id")
    .eq("id", stepRow.sku_id)
    .maybeSingle();

  if (skuErr || !sku?.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const allowed =
    sku.is_active === true || (user != null && user.id === sku.user_id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(TUTORIAL_VIDEO_BUCKET)
    .createSignedUrl(objectPath, 3600);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Could not create a playback URL." },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
