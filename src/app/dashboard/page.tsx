import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardTutorialActions } from "@/components/DashboardTutorialActions";
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

function isDynamicServerUsageError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    (e as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE"
  );
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  void searchParams;

  try {
    const supabase = createSupabaseServerClient();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.error("[dashboard] getUser error", {
        message: authErr.message,
        name: authErr.name
      });
    }
    const user = authData.user;
    if (!user) {
      return null;
    }

    // IMPORTANT: payment unlock is handled only by Stripe webhook (single source of truth).
    // Dashboard render must never mutate paid_guide_slots.

    let skus: SkuRow[] = [];
    try {
      let rawSkus: Pick<SkuRow, "id" | "name" | "is_active">[] | null = null;
      {
        const ordered = await supabase
          .from("skus")
          .select("id,name,is_active")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (!ordered.error && ordered.data) {
          rawSkus = ordered.data;
        } else if (ordered.error) {
          const code = (ordered.error as { code?: string }).code;
          const msg = String(ordered.error.message ?? "").toLowerCase();
          const missingCreatedAt =
            code === "42703" || msg.includes("created_at") || msg.includes("does not exist");
          if (missingCreatedAt) {
            const fallback = await supabase
              .from("skus")
              .select("id,name,is_active")
              .eq("user_id", user.id);
            if (!fallback.error && fallback.data) {
              rawSkus = fallback.data;
            } else if (fallback.error) {
              console.error("[dashboard] skus select (fallback) failed", fallback.error);
            }
          } else {
            console.error("[dashboard] skus select failed", ordered.error);
          }
        }
      }

      if (rawSkus?.length) {
        const ids = rawSkus.map((s) => s.id);
        const { data: stepRows, error: stepErr } = await supabase
          .from("steps")
          .select("id,sku_id,step_number,step_name,scan_count")
          .in("sku_id", ids);

        if (stepErr) {
          console.error("[dashboard] steps select failed", stepErr);
          skus = rawSkus.map((s) => ({ ...s, steps: null }));
        } else {
          const bySku = new Map<string, StepRow[]>();
          for (const st of stepRows ?? []) {
            const sid = String((st as { sku_id: string }).sku_id);
            const row: StepRow = {
              id: String((st as { id: string }).id),
              step_number: Number((st as { step_number: number }).step_number),
              step_name: String((st as { step_name: string }).step_name),
              scan_count: Number((st as { scan_count: number }).scan_count ?? 0)
            };
            if (!bySku.has(sid)) bySku.set(sid, []);
            bySku.get(sid)!.push(row);
          }
          skus = rawSkus.map((s) => ({
            ...s,
            steps: bySku.get(s.id) ?? null
          }));
        }
      }
    } catch (e) {
      console.error("[dashboard] skus/steps load threw", e);
      skus = [];
    }

    let guideCount = 0;
    let paidGuideSlots = 0;
    try {
      const { data: guideRow, error: guideCountError } = await supabase
        .from("users")
        .select("guide_count")
        .eq("id", user.id)
        .maybeSingle();
      if (!guideCountError) {
        const parsed = Number(guideRow?.guide_count);
        if (Number.isFinite(parsed) && parsed >= 0) {
          guideCount = parsed;
        }
      } else {
        console.error("[dashboard] guide_count read failed; defaulting to 0", {
          code: guideCountError.code,
          message: guideCountError.message,
          details: (guideCountError as any).details,
          hint: (guideCountError as any).hint
        });
      }
    } catch (e) {
      console.error("[dashboard] guide_count query threw; defaulting to 0", {
        userId: user.id,
        error: e
      });
      guideCount = 0;
    }

    try {
      const { data: paidRow, error: paidSlotsError } = await supabase
        .from("users")
        .select("paid_guide_slots")
        .eq("id", user.id)
        .maybeSingle();
      if (!paidSlotsError) {
        const paid = Number(paidRow?.paid_guide_slots);
        if (Number.isFinite(paid) && paid >= 0) {
          paidGuideSlots = paid;
        }
      } else {
        console.error("[dashboard] paid_guide_slots read failed; defaulting to 0", {
          code: paidSlotsError.code,
          message: paidSlotsError.message,
          details: (paidSlotsError as any).details,
          hint: (paidSlotsError as any).hint
        });
      }
    } catch (e) {
      console.error("[dashboard] paid_guide_slots query threw; defaulting to 0", {
        userId: user.id,
        error: e
      });
      paidGuideSlots = 0;
    }

    return (
      <div className="space-y-12">
        <TutorialCreator guideCount={guideCount} paidGuideSlots={paidGuideSlots} />

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Your tutorials</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Use <span className="font-medium">Edit</span> to change names and descriptions.{" "}
              <span className="font-medium">Unpublish</span> hides a live tutorial from public
              links; finish payment to activate drafts.
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
                  <div className="flex flex-col gap-3 border-b border-zinc-100 p-5 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="text-base font-semibold">{sku.name}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-sm text-zinc-500">
                        <span>
                          {steps.length} step{steps.length === 1 ? "" : "s"}
                        </span>
                        <span
                          className={
                            sku.is_active ? "text-emerald-700" : "text-amber-800"
                          }
                        >
                          {sku.is_active ? "Published" : "Not published"}
                        </span>
                      </div>
                    </div>
                    <DashboardTutorialActions
                      skuId={sku.id}
                      isActive={sku.is_active}
                    />
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
  } catch (e) {
    if (isDynamicServerUsageError(e)) throw e;
    console.error("[dashboard] fatal render error", e);
    return (
      <div className="card max-w-lg space-y-3 p-6">
        <h1 className="text-lg font-semibold text-zinc-900">Could not load this page</h1>
        <p className="text-sm text-zinc-600">
          Something went wrong on the server. Please refresh. If it continues, check Vercel logs and
          confirm Supabase env vars are set for this deployment.
        </p>
      </div>
    );
  }
}
