import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { env } from "@/lib/env";

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
  const base = env.appUrl().replace(/\/$/, "");
  const tutorialPath = `/tutorial/${encodeURIComponent(skuId)}`;
  const target =
    step === null || step === ""
      ? `${base}${tutorialPath}`
      : `${base}${tutorialPath}?step=${encodeURIComponent(step)}`;

  const png = await QRCode.toBuffer(target, {
    type: "png",
    width: 512,
    margin: 1,
    color: {
      dark: "#111111",
      light: "#FFFFFF"
    }
  });

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
