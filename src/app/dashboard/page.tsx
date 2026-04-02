import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TutorialCreator } from "@/components/TutorialCreator";

type StepRow = {
  id: string;
  step_number: number;
  step_name: string;
  scan_count: number;
};

type SkuRow = {
  id: string;
  name: string;
  is_active: boolean;
  steps: StepRow[] | null;
};

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  let skus: SkuRow[] = [];
  try {
    const { data: rawSkus, error } = await supabase
      .from("skus")
      .select("id,name,is_active,steps(id,step_number,step_name,scan_count)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && rawSkus) {
      skus = rawSkus as SkuRow[];
    }
  } catch {
    skus = [];
  }

  return (
    <div className="space-y-12">
      <TutorialCreator />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Your tutorials</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Published tutorials are active; unpaid drafts stay inactive until checkout completes.
          </p>
        </div>

        <div className="grid gap-4">
          {skus.length === 0 ? (
            <div className="card p-6 text-sm text-zinc-600">
              No tutorials yet. Use the form above to create one.
            </div>
          ) : null}

          {skus.map((sku) => {
            const steps = [...(sku.steps ?? [])].sort((a, b) => a.step_number - b.step_number);
            return (
              <div key={sku.id} className="card overflow-hidden">
                <div className="flex flex-col gap-2 border-b border-zinc-100 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="text-base font-semibold">{sku.name}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-sm text-zinc-500">
                      <span>{steps.length} step{steps.length === 1 ? "" : "s"}</span>
                      <span
                        className={
                          sku.is_active ? "text-emerald-700" : "text-amber-700"
                        }
                      >
                        {sku.is_active ? "Active" : "Inactive (payment pending)"}
                      </span>
                    </div>
                  </div>
                  {sku.is_active ? (
                    <Link
                      className="btn-primary shrink-0 text-sm"
                      href={`/dashboard/success?skuId=${encodeURIComponent(sku.id)}`}
                    >
                      View QR codes
                    </Link>
                  ) : null}
                </div>

                {steps.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-zinc-600">No steps.</div>
                ) : (
                  <ul className="divide-y divide-zinc-100">
                    {steps.map((st) => (
                      <li
                        key={st.id}
                        className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            <span className="text-zinc-400">#{st.step_number}</span>{" "}
                            {st.step_name}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            Scans {st.scan_count} ·{" "}
                            <Link
                              className="text-brand hover:underline"
                              href={`/play/${st.id}`}
                            >
                              /play/{st.id}
                            </Link>
                          </div>
                        </div>
                        {sku.is_active ? (
                          <a
                            className="btn-ghost shrink-0 text-sm"
                            href={`/api/qr/${st.id}?download=1`}
                          >
                            Download QR PNG
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
