import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { extractYouTubeVideoId } from "@/lib/video";
import { fetchSkuVisibleToViewer, fetchTutorialSteps } from "../tutorialAccess";
import { PrintBar } from "./PrintBar";
import { PrintManualView, type SkuPrint } from "./PrintManualView";
import { resolvePrintBranding } from "./resolvePrintBranding";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { skuId: string };

async function resolveParams(
  params: PageParams | Promise<PageParams>
): Promise<PageParams> {
  return Promise.resolve(params);
}

type SkuRow = {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  creator_name?: string | null;
  author?: string | null;
  creator_site?: string | null;
  creator_logo?: string | null;
  level?: string | null;
  materials_text?: string | null;
  tools_text?: string | null;
};

/** YouTube still frame for print cover when the first step uses a YouTube URL. */
function coverHeroImageFromFirstStep(youtubeUrl: string | undefined): string | null {
  if (!youtubeUrl?.trim()) return null;
  const vid = extractYouTubeVideoId(youtubeUrl.trim());
  return vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null;
}

export async function generateMetadata({
  params
}: {
  params: PageParams | Promise<PageParams>;
}): Promise<Metadata> {
  const { skuId } = await resolveParams(params);
  const { sku } = await fetchSkuVisibleToViewer(skuId);
  const title = sku?.name?.trim()
    ? `${sku.name} · Print manual`
    : "Print manual";
  return {
    title,
    description: "Printable step guide with QR codes to watch each clip."
  };
}

export default async function TutorialPrintPage({
  params
}: {
  params: PageParams | Promise<PageParams>;
}) {
  const { skuId } = await resolveParams(params);
  const { sku } = await fetchSkuVisibleToViewer(skuId);

  if (!sku) {
    notFound();
  }

  const { data: stepRows, error: stepsErr } = await fetchTutorialSteps(
    sku.id,
    sku
  );

  if (stepsErr) {
    notFound();
  }

  const steps = stepRows ?? [];

  const row = sku as SkuRow;
  const { displayLevel } = resolvePrintBranding({
    creator_name: row.creator_name,
    author: row.author,
    level: row.level
  });

  const record = row as Record<string, unknown>;
  const customCover =
    typeof record.cover_image_url === "string"
      ? record.cover_image_url.trim()
      : typeof record.coverImageUrl === "string"
        ? record.coverImageUrl.trim()
        : "";
  const coverHeroImageUrl =
    customCover ||
    coverHeroImageFromFirstStep(steps[0]?.youtube_url) ||
    null;

  const skuPrint: SkuPrint = {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    creator_logo: row.creator_logo ?? null,
    level: row.level ?? null,
    materials_text: row.materials_text ?? null,
    tools_text: row.tools_text ?? null,
    display_level: displayLevel,
    cover_hero_image_url: coverHeroImageUrl
  };

  return (
    <div id="pm-root">
      <PrintBar
        tutorialHref={`/tutorial/${encodeURIComponent(sku.id)}`}
        tutorialTitle={row.name}
      />
      <PrintManualView sku={skuPrint} steps={steps} />
    </div>
  );
}
