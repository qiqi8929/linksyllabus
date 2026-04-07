import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchSkuVisibleToViewer } from "../tutorialAccess";
import { PrintBar } from "./PrintBar";
import { PrintManualView, type SkuPrint } from "./PrintManualView";
import { resolvePrintBranding } from "./resolvePrintBranding";

export const dynamic = "force-dynamic";

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
  creator_site?: string | null;
  creator_logo?: string | null;
  level?: string | null;
};

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
  const { supabase, sku } = await fetchSkuVisibleToViewer(skuId);

  if (!sku) {
    notFound();
  }

  const { data: stepRows, error: stepsErr } = await supabase
    .from("steps")
    .select("id,step_number,step_name,description")
    .eq("sku_id", sku.id)
    .order("step_number", { ascending: true });

  if (stepsErr) {
    notFound();
  }

  const steps = stepRows ?? [];

  const row = sku as SkuRow;
  const { displayCreatorName, displayLevel } = await resolvePrintBranding({
    user_id: row.user_id,
    creator_name: row.creator_name,
    level: row.level
  });

  const skuPrint: SkuPrint = {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    creator_name: row.creator_name ?? null,
    creator_site: row.creator_site ?? null,
    creator_logo: row.creator_logo ?? null,
    level: row.level ?? null,
    display_creator_name: displayCreatorName,
    display_level: displayLevel
  };

  return (
    <div id="pm-root">
      <PrintBar tutorialHref={`/tutorial/${encodeURIComponent(sku.id)}`} />
      <PrintManualView sku={skuPrint} steps={steps} />
    </div>
  );
}
