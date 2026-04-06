import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TutorialEditForm } from "@/components/TutorialEditForm";

export const dynamic = "force-dynamic";

type PageParams = { skuId: string };

async function resolveParams(
  params: PageParams | Promise<PageParams>
): Promise<PageParams> {
  return Promise.resolve(params);
}

export default async function EditTutorialPage({
  params
}: {
  params: PageParams | Promise<PageParams>;
}) {
  const { skuId } = await resolveParams(params);
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id) {
    notFound();
  }

  const { data: sku, error: skuErr } = await supabase
    .from("skus")
    .select("id,name,description,user_id")
    .eq("id", skuId)
    .maybeSingle();

  if (skuErr || !sku || sku.user_id !== user.id) {
    notFound();
  }

  const { data: stepRows, error: stepsErr } = await supabase
    .from("steps")
    .select(
      "id,step_number,step_name,description,youtube_url,start_time,end_time"
    )
    .eq("sku_id", sku.id)
    .order("step_number", { ascending: true });

  if (stepsErr) {
    notFound();
  }

  const steps = (stepRows ?? []).map((r) => ({
    id: r.id,
    step_number: r.step_number,
    step_name: r.step_name,
    description: r.description ?? "",
    youtube_url: r.youtube_url,
    start_time: r.start_time,
    end_time: r.end_time
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link className="text-sm text-zinc-600 hover:text-zinc-900" href="/dashboard">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Edit tutorial</h1>
        <p className="mt-1 text-sm text-zinc-600">{sku.name}</p>
      </div>

      <TutorialEditForm
        skuId={sku.id}
        initialName={sku.name}
        initialDescription={sku.description ?? ""}
        steps={steps}
      />
    </div>
  );
}
