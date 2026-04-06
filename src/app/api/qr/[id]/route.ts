import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { publicSiteOriginFromRequest } from "@/lib/publicOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const base = publicSiteOriginFromRequest(req);
  const url = `${base}/play/${params.id}`;
  const png = await QRCode.toBuffer(url, {
    type: "png",
    width: 512,
    margin: 1,
    color: {
      dark: "#111111",
      light: "#FFFFFF"
    }
  });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const body = new Uint8Array(png);

  return new NextResponse(body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
      ...(download
        ? { "content-disposition": `attachment; filename="linksylabus-step-${params.id}.png"` }
        : {})
    }
  });
}

