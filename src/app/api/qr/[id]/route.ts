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
 * Step QR PNGs. `surface=work-order` always encodes the LinkSyllabus play page
 * for that step so scans stay in-app at the right timestamp.
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

  const playTarget = resolveWorkOrderQrTarget(
    { id: params.id, youtube_url: null, start_time: null, end_time: null },
    origin
  );

  let target = playTarget;
  if (surface !== "work-order") {
    try {
      const admin = createSupabaseAdminClient();
      const { data } = await admin
        .from("steps")
        .select("id,youtube_url,start_time,end_time")
        .eq("id", params.id)
        .maybeSingle();

      target = resolveStepQrTarget(data as StepLikeForQr | null, origin);
    } catch {
      target = playTarget;
    }
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
