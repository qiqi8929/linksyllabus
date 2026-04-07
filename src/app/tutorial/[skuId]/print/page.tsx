import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchSkuVisibleToViewer } from "../tutorialAccess";
import { PrintBar } from "./PrintBar";
import { PrintManualView, type SkuPrint } from "./PrintManualView";

export const dynamic = "force-dynamic";

type PageParams = { skuId: string };

async function resolveParams(
  params: PageParams | Promise<PageParams>
): Promise<PageParams> {
  return Promise.resolve(params);
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

  const skuPrint = sku as SkuPrint;

  return (
    <div id="pm-root">
      <PrintBar tutorialHref={`/tutorial/${encodeURIComponent(sku.id)}`} />
      <PrintManualView sku={skuPrint} steps={steps} />
    </div>
  );
}
