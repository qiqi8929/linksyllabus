import { NextResponse } from "next/server";
import { publicSiteOriginFromRequest } from "@/lib/publicOrigin";
import { qrPngBuffer } from "@/lib/qrPng";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveStepQrTarget, type StepLikeForQr } from "@/lib/stepQrTarget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single QR endpoint for both surfaces:
 *   - PDF (rendered by the browser print dialog) — `<img src="/api/qr/{id}?surface=pdf">`
 *   - Long image (html2canvas) — `<img src="/api/qr/{id}?surface=long-image">`
 * The `surface` query param is purely a log label. The encoded URL is the
 * same regardless — it's computed by `resolveStepQrTarget` once, here.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const url = new URL(req.url);
  const origin = publicSiteOriginFromRequest(req);
  const surfaceParam = (url.searchParams.get("surface") ?? "").trim();
  const surface: "pdf" | "long-image" | "unspecified" =
    surfaceParam === "pdf"
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

    target = resolveStepQrTarget(data as StepLikeForQr | null, origin);
  } catch {
    /* keep play-page fallback */
  }

  if (surface === "pdf") {
    console.log("PDF QR URL:", target);
  } else if (surface === "long-image") {
    console.log("Long image QR URL:", target);
  } else {
    console.log("[QR] target:", target);
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
