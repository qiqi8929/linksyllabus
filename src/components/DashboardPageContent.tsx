"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardTutorialActions } from "@/components/DashboardTutorialActions";
import { DashboardTutorialCreatorClient } from "@/components/DashboardTutorialCreatorClient";
import type { DashboardSkuRow } from "@/lib/dashboardBootstrap";
import { DASHBOARD_BOOTSTRAP_REFETCH_EVENT } from "@/lib/dashboardEvents";

type BootstrapPayload = {
  guideCount: number;
  paidGuideSlots: number;
  skus: DashboardSkuRow[];
};

export function DashboardPageContent() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!quiet) {
      setLoadError(null);
      setLoading(true);
    }
    try {
      const res = await fetch("/api/dashboard/bootstrap", {
        credentials: "include",
        cache: "no-store"
      });
      if (res.status === 401) {
        window.location.href = "/login?next=/dashboard";
        return;
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Request failed (${res.status})`);
      }
      const json = (await res.json()) as BootstrapPayload;
      setData({
        guideCount: Number.isFinite(json.guideCount) ? json.guideCount : 0,
        paidGuideSlots: Number.isFinite(json.paidGuideSlots) ? json.paidGuideSlots : 0,
        skus: Array.isArray(json.skus) ? json.skus : []
      });
      setLoadError(null);
    } catch (e) {
      if (!quiet) {
        setLoadError(e instanceof Error ? e.message : "Could not load dashboard.");
        setData(null);
      }
    } finally {
      if (!quiet) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefetch = () => {
      void load({ quiet: true });
    };
    window.addEventListener(DASHBOARD_BOOTSTRAP_REFETCH_EVENT, onRefetch);
    return () => window.removeEventListener(DASHBOARD_BOOTSTRAP_REFETCH_EVENT, onRefetch);
  }, [load]);

  if (loading && !data && !loadError) {
    return (
      <div className="space-y-12">
        <div className="card p-6 text-sm text-zinc-600">Loading dashboard…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card max-w-lg space-y-3 p-6">
        <h1 className="text-lg font-semibold text-zinc-900">Could not load dashboard</h1>
        <p className="text-sm text-zinc-600 whitespace-pre-wrap">{loadError}</p>
        <button type="button" className="btn-primary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  const guideCount = data?.guideCount ?? 0;
  const paidGuideSlots = data?.paidGuideSlots ?? 0;
  const safeSkus = data?.skus ?? [];

  return (
    <div className="space-y-12">
      <DashboardTutorialCreatorClient
        guideCount={guideCount}
        paidGuideSlots={paidGuideSlots}
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Your tutorials</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Use <span className="font-medium">Edit</span> to change names and descriptions.{" "}
            <span className="font-medium">Unpublish</span> hides a live tutorial from public links;
            finish payment to activate drafts.
          </p>
        </div>

        <div className="grid gap-4">
          {safeSkus.length === 0 ? (
            <div className="card p-6 text-sm text-zinc-600">
              No tutorials yet. Use the form above to create one.
            </div>
          ) : null}

          {safeSkus.map((sku) => {
            const steps = [...(sku.steps ?? [])]
              .filter((st) => typeof st.id === "string" && st.id.length > 0)
              .sort((a, b) => a.step_number - b.step_number);
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
                        className={sku.is_active ? "text-emerald-700" : "text-amber-800"}
                      >
                        {sku.is_active ? "Published" : "Not published"}
                      </span>
                    </div>
                  </div>
                  <DashboardTutorialActions skuId={sku.id} isActive={sku.is_active} />
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
                            <span className="text-zinc-400">#{st.step_number}</span> {st.step_name}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            Scans {st.scan_count} ·{" "}
                            <Link className="text-brand hover:underline" href={`/play/${st.id}`}>
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
