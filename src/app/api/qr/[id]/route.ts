import { NextResponse } from "next/server";
import { publicSiteOriginFromRequest } from "@/lib/publicOrigin";
import { qrPngBuffer } from "@/lib/qrPng";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  resolveStepQrTarget,
  resolveWorkOrderQrTarget,
  type StepLikeForQr
} from "@/lib/stepQrTarget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step QR PNGs. `surface=work-order` encodes YouTube (or Vimeo) URLs with timestamps;
 * other surfaces use the play-page target for legacy print layouts.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const url = new URL(req.url);
  const origin = publicSiteOriginFromRequest(req);
  const surfaceParam = (url.searchParams.get("surface") ?? "").trim();
  const surface: "pdf" | "long-image" | "work-order" | "unspecified" =
    surfaceParam === "work-order"
      ? "work-order"
      : surfaceParam === "pdf"
        ? "pdf"
        : surfaceParam === "long-image"
          ? "long-image"
          : "unspecified";

  let target = `${origin}/play/${params.id}`;
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("steps")
      .select("id,youtube_url,start_time,end_time")
      .eq("id", params.id)
      .maybeSingle();

    const step = data as StepLikeForQr | null;
    target =
      surface === "work-order"
        ? resolveWorkOrderQrTarget(step, origin)
        : resolveStepQrTarget(step, origin);
  } catch {
    /* keep play-page fallback */
  }

  const png = await qrPngBuffer(target);
  const download = url.searchParams.get("download") === "1";
  const body = new Uint8Array(png);

  return new NextResponse(body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
      ...(download
        ? {
            "content-disposition": `attachment; filename="linksylabus-step-${params.id}.png"`
          }
        : {})
    }
  });
}
