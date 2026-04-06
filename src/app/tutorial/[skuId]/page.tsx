import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TutorialViewClient, type TutorialStepPayload } from "./TutorialViewClient";
import { fetchSkuVisibleToViewer } from "./tutorialAccess";

export const dynamic = "force-dynamic";

type PageParams = { skuId: string };

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

async function resolveParams(
  params: PageParams | Promise<PageParams>
): Promise<PageParams> {
  return Promise.resolve(params);
}

function parseStepParam(sp: Record<string, string | string[] | undefined>) {
  const raw = sp.step;
  const stepStr = Array.isArray(raw) ? raw[0] : raw;
  const n = stepStr != null ? parseInt(String(stepStr), 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return undefined;
  return n;
}

export async function generateMetadata({
  params
}: {
  params: PageParams | Promise<PageParams>;
}): Promise<Metadata> {
  const { skuId } = await resolveParams(params);
  const { sku } = await fetchSkuVisibleToViewer(skuId);

  const title = sku?.name?.trim()
    ? `${sku.name} · Tutorial`
    : "Tutorial · LinkSyllabus";

  return { title, description: "Step-by-step tutorial with video clips." };
}

export default async function TutorialPage({
  params,
  searchParams
}: {
  params: PageParams | Promise<PageParams>;
  searchParams?: SearchParamsInput;
}) {
  const { skuId } = await resolveParams(params);
  const sp = await Promise.resolve(searchParams ?? {});
  const initialStepNumber = parseStepParam(sp);

  const { supabase, sku } = await fetchSkuVisibleToViewer(skuId);

  if (!sku) {
    notFound();
  }

  const { data: stepRows, error: stepsErr } = await supabase
    .from("steps")
    .select(
      "id,step_number,step_name,description,youtube_url,start_time,end_time,sku_id"
    )
    .eq("sku_id", sku.id)
    .order("step_number", { ascending: true });

  if (stepsErr) {
    notFound();
  }

  const steps: TutorialStepPayload[] = (stepRows ?? []).map((s) => ({
    id: s.id,
    step_number: s.step_number,
    step_name: s.step_name,
    description: s.description ?? "",
    youtube_url: s.youtube_url,
    start_time: s.start_time,
    end_time: s.end_time
  }));

  return (
    <main className="container-page py-8 md:py-12">
      {!sku.is_active ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-medium">Preview</span> — This tutorial is not published yet.
          After payment completes, anyone with the link can open it.
        </div>
      ) : null}
      <div className="mb-8 space-y-2 border-b border-zinc-100 pb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Tutorial
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
          {sku.name}
        </h1>
        {sku.description?.trim() ? (
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-600">
            {sku.description}
          </p>
        ) : null}
      </div>

      {steps.length === 0 ? (
        <div className="card p-8 text-center text-sm text-zinc-600">
          No steps published yet.
        </div>
      ) : (
        <TutorialViewClient
          skuId={sku.id}
          steps={steps}
          initialStepNumber={initialStepNumber}
        />
      )}

      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center">
        <Link
          className="text-sm font-medium text-orange-700 hover:text-orange-900"
          href={`/tutorial/${encodeURIComponent(sku.id)}/print`}
        >
          Print manual (QR codes)
        </Link>
        <Link className="text-sm text-zinc-500 hover:text-zinc-800" href="/">
          Home
        </Link>
      </div>
    </main>
  );
}
