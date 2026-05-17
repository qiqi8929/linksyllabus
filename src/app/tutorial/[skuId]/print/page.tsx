import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchSkuVisibleToViewer, fetchTutorialSteps } from "../tutorialAccess";
import { PrintBar } from "./PrintBar";
import { WorkOrderView } from "./WorkOrderView";
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
  level?: string | null;
  materials_text?: string | null;
  tools_text?: string | null;
};

export async function generateMetadata({
  params
}: {
  params: PageParams | Promise<PageParams>;
}): Promise<Metadata> {
  const { skuId } = await resolveParams(params);
  const { sku } = await fetchSkuVisibleToViewer(skuId);
  const title = sku?.name?.trim()
    ? `${sku.name} · Work order`
    : "Work order";
  return {
    title,
    description:
      "Printable work order with step checklist and QR codes linked to each video timestamp."
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

  return (
    <div id="pm-root">
      <PrintBar
        tutorialHref={`/tutorial/${encodeURIComponent(sku.id)}`}
        tutorialTitle={row.name}
      />
      <WorkOrderView
        sku={{
          id: row.id,
          name: row.name,
          display_level: displayLevel,
          materials_text: row.materials_text ?? null,
          tools_text: row.tools_text ?? null
        }}
        steps={steps}
      />
    </div>
  );
}
