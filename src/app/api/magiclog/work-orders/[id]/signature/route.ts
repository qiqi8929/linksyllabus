import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const ext = file.type.includes("png") ? "png" : "jpg";
  const path = `${user.id}/${params.id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const admin = createSupabaseAdminClient();
  const { error: uploadErr } = await admin.storage
    .from("bluebook-signatures")
    .upload(path, buffer, {
      contentType: file.type || "image/png",
      upsert: true
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: signed } = await admin.storage
    .from("bluebook-signatures")
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  const publicUrl = signed?.signedUrl ?? null;

  await supabase
    .from("bluebook_work_orders")
    .update({ mentor_signature_url: path })
    .eq("id", params.id)
    .eq("user_id", user.id);

  return NextResponse.json({ path, signedUrl: publicUrl });
}
