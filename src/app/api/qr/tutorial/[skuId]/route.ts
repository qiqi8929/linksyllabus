import { NextResponse } from "next/server";
import { publicSiteOriginFromRequest } from "@/lib/publicOrigin";
import { qrPngBuffer } from "@/lib/qrPng";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QR encodes `/tutorial/[skuId]?step=N` so scanning opens the tutorial on that step’s video.
 */
export async function GET(
  req: Request,
  { params }: { params: { skuId: string } }
) {
  const skuId = params.skuId;
  const urlObj = new URL(req.url);
  const step = urlObj.searchParams.get("step");
  const base = publicSiteOriginFromRequest(req);
  const tutorialPath = `/tutorial/${encodeURIComponent(skuId)}`;
  const target =
    step === null || step === ""
      ? `${base}${tutorialPath}`
      : `${base}${tutorialPath}?step=${encodeURIComponent(step)}`;

  const png = await qrPngBuffer(target);

  const download = urlObj.searchParams.get("download") === "1";
  const body = new Uint8Array(png);

  return new NextResponse(body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
      ...(download
        ? {
            "content-disposition": `attachment; filename="linksyllabus-tutorial-${skuId}-step.png"`
          }
        : {})
    }
  });
}
