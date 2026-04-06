import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TutorialStepsClient, type TutorialStepPayload } from "./TutorialStepsClient";

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
  const supabase = createSupabaseServerClient();
  const { data: sku } = await supabase
    .from("skus")
    .select("name")
    .eq("id", skuId)
    .eq("is_active", true)
    .maybeSingle();

  const title = sku?.name?.trim()
    ? `${sku.name} · Tutorial`
    : "Tutorial · LinkSyllabus";

  return { title, description: "Step-by-step tutorial with video clips." };
}

export default async function TutorialPage({
  params
}: {
  params: PageParams | Promise<PageParams>;
}) {
  const { skuId } = await resolveParams(params);

  const supabase = createSupabaseServerClient();

  const { data: sku, error: skuErr } = await supabase
    .from("skus")
    .select("id,name,description,is_active")
    .eq("id", skuId)
    .eq("is_active", true)
    .maybeSingle();

  if (skuErr || !sku) {
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
        <TutorialStepsClient skuId={sku.id} steps={steps} />
      )}

      <div className="mt-10 text-center">
        <Link className="text-sm text-zinc-500 hover:text-zinc-800" href="/">
          Home
        </Link>
      </div>
    </main>
  );
}
