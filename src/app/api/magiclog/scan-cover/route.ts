import { NextResponse } from "next/server";
import { extractMagicLogCoverFields } from "@/lib/magiclog/scanCover";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
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

  const mimeType = file.type || "image/jpeg";
  if (!mimeType.startsWith("image/")) {
    return NextResponse.json({ error: "Upload an image file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageBase64 = buffer.toString("base64");

  try {
    const fields = await extractMagicLogCoverFields(imageBase64, mimeType);
    return NextResponse.json({ fields });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Cover scan failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
