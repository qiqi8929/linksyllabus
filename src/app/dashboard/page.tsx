import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

function readSearchParam(
  value: string | string[] | undefined
): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const checkout = readSearchParam(sp.checkout);
  const unlockProcessed = readSearchParam(sp.unlockProcessed);
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  if (checkout === "guide_unlock_success" && unlockProcessed !== "1") {
    try {
      const admin = createSupabaseAdminClient();
      const { error: ensureErr } = await admin
        .from("users")
        .upsert(
          {
            id: user.id,
            email: user.email ?? null
          },
          { onConflict: "id" }
        );
      if (ensureErr) {
        console.error("[dashboard] guide_unlock_success ensure user row failed", {
          userId: user.id,
          code: ensureErr.code,
          message: ensureErr.message,
          details: (ensureErr as any).details,
          hint: (ensureErr as any).hint
        });
      }

      const { data: row, error: readErr } = await admin
        .from("users")
        .select("paid_guide_slots")
        .eq("id", user.id)
        .maybeSingle();
      if (readErr) {
        console.error("[dashboard] guide_unlock_success read paid_guide_slots failed", {
          userId: user.id,
          code: readErr.code,
          message: readErr.message,
          details: (readErr as any).details,
          hint: (readErr as any).hint
        });
      } else {
        const current = Math.max(0, Number(row?.paid_guide_slots ?? 0));
        const { data: updatedRow, error: upErr } = await admin
          .from("users")
          .update({ paid_guide_slots: current + 1 })
          .eq("id", user.id)
          .select("id,paid_guide_slots")
          .maybeSingle();
        if (upErr) {
          console.error("[dashboard] guide_unlock_success increment paid_guide_slots failed", {
            userId: user.id,
            code: upErr.code,
            message: upErr.message,
            details: (upErr as any).details,
            hint: (upErr as any).hint
          });
        } else if (!updatedRow) {
          console.error("[dashboard] guide_unlock_success increment updated zero rows", {
            userId: user.id,
            previousPaidGuideSlots: current
          });
        } else {
          console.log("[dashboard] guide_unlock_success incremented paid_guide_slots", {
            userId: user.id,
            previousPaidGuideSlots: current,
            newPaidGuideSlots: updatedRow.paid_guide_slots
          });
        }
      }
    } catch (e) {
      console.error("[dashboard] guide_unlock_success server-side increment threw", {
        userId: user.id,
        error: e
      });
    }

    // Preserve checkout param for client draft restore/success UI,
    // but mark processed to avoid duplicate increments on refresh.
    redirect("/dashboard?checkout=guide_unlock_success&unlockProcessed=1");
  }

  let skus: SkuRow[] = [];
  let guideCount = 0;
  let paidGuideSlots = 0;
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

  // Read usage defensively: never let users-table issues break dashboard rendering.
  // If guide_count cannot be read, default to 0 per UX requirement.
  guideCount = 0;
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
}
