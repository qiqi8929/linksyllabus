import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const url = `${env.appUrl()}/play/${params.id}`;
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

  return new NextResponse(png, {
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
      ...(download
        ? { "content-disposition": `attachment; filename="linksylabus-step-${params.id}.png"` }
        : {})
    }
  });
}

