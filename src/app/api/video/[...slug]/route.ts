import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public Storage buckets allowed through this proxy (avoid open SSRF). */
const ALLOWED_PUBLIC_BUCKETS = new Set(["marketing"]);

function buildUpstreamPublicUrl(
  supabaseOrigin: string,
  bucket: string,
  objectSegments: string[]
): string {
  const path = objectSegments.map(encodeURIComponent).join("/");
  return `${supabaseOrigin}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path}`;
}

/**
 * Proxy Supabase Storage **public** objects through Next.js (same-origin, no CORS).
 *
 * Example: `/api/video/marketing/hero-demo.mp4` →
 * `{SUPABASE_URL}/storage/v1/object/public/marketing/hero-demo.mp4`
 */
export async function GET(
  request: Request,
  { params }: { params: { slug: string[] } }
) {
  const slug = params.slug;
  if (!slug?.length) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }

  const bucket = slug[0];
  if (!ALLOWED_PUBLIC_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Bucket not allowed." }, { status: 403 });
  }

  const objectSegments = slug.slice(1);
  if (
    objectSegments.length === 0 ||
    objectSegments.some((s) => !s || s === "." || s === ".." || s.includes("\\"))
  ) {
    return NextResponse.json({ error: "Invalid object path." }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  const upstreamUrl = buildUpstreamPublicUrl(base, bucket, objectSegments);

  const range = request.headers.get("range");
  const upstream = await fetch(upstreamUrl, {
    redirect: "follow",
    headers: range ? { Range: range } : undefined
  });

  const out = new Headers();
  const copy = [
    "content-type",
    "content-length",
    "accept-ranges",
    "content-range",
    "etag",
    "last-modified"
  ] as const;
  for (const k of copy) {
    const v = upstream.headers.get(k);
    if (v) out.set(k, v);
  }
  out.set("cache-control", "public, max-age=3600, s-maxage=3600");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: out
  });
}
