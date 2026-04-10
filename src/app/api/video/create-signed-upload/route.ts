import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { TUTORIAL_VIDEO_BUCKET } from "@/lib/storageVideoUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  ext?: string;
};

const ALLOWED_EXT = new Set(["mp4", "mov", "avi"]);

export async function POST(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const ext = String(body.ext ?? "").trim().toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: "Invalid file extension." }, { status: 400 });
  }

  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(TUTORIAL_VIDEO_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data?.token) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create signed upload URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    path,
    token: data.token
  });
}

