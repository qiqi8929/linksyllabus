import { NextResponse } from "next/server";
import { publicSiteOriginFromRequest } from "@/lib/publicOrigin";
import { qrPngBuffer } from "@/lib/qrPng";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const base = publicSiteOriginFromRequest(req);
  const url = `${base}/play/${params.id}`;
  const png = await qrPngBuffer(url);

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

