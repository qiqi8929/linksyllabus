"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/FormError";

type DashboardData = {
  profile: {
    email: string | null;
    trade: string | null;
    current_period: number;
    province: string;
    bluebook_onboarding_complete: boolean;
  };
  period: number;
  requirements: {
    hoursRequired: number;
    mandatoryRequired: number;
    optionalRequired: number;
  };
  progress: {
    total_hours: number;
    mandatory_completed: number;
    optional_completed: number;
    total_competences?: number;
    period_complete: boolean;
  };
  estimatedCompletion: string | null;
  recentWorkOrders: Array<{
    id: string;
    task_name: string | null;
    competence_name: string;
    hours: number | null;
    status: string;
    created_at: string;
  }>;
};

export function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/magiclog/dashboard")
      .then((r) => r.json())
      .then((j) => {
        if (j.profile && !j.profile.bluebook_onboarding_complete) {
          router.replace("/magiclog/onboarding");
          return;
        }
        if (j.error) throw new Error(j.error);
        setData(j as DashboardData);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      });
  }, [router]);

  if (!data) {
    return (
      <div>
        <FormError message={error} />
        {!error ? <p className="text-sm text-zinc-600">Loading dashboard…</p> : null}
      </div>
    );
  }

  const hoursPct = Math.min(
    100,
    Math.round((data.progress.total_hours / data.requirements.hoursRequired) * 100)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Hi{" "}
          {data.profile.email?.split("@")[0] ?? "there"} 👋
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {data.profile.trade ?? "Trade"} · Period {data.period} ·{" "}
          {data.profile.province === "alberta" ? "Alberta" : data.profile.province}
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Period {data.period} progress
        </h2>
        <p className="mt-3 text-sm">
          Hours: {data.progress.total_hours} / {data.requirements.hoursRequired}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-orange-500"
            style={{ width: `${hoursPct}%` }}
          />
        </div>
        <p className="mt-3 text-sm">
          Mandatory: {data.progress.mandatory_completed} / {data.requirements.mandatoryRequired}
          {data.progress.mandatory_completed >= data.requirements.mandatoryRequired
            ? " ✓"
            : ""}
        </p>
        <p className="text-sm">
          Optional: {data.progress.optional_completed} / {data.requirements.optionalRequired}
        </p>
        {data.progress.total_competences != null ? (
          <p className="mt-1 text-xs text-zinc-500">
            {data.progress.total_competences} signed competence
            {data.progress.total_competences === 1 ? "" : "s"} this period
          </p>
        ) : null}
        {data.estimatedCompletion ? (
          <p className="mt-2 text-xs text-zinc-500">
            Est. completion: {data.estimatedCompletion}
          </p>
        ) : null}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Recent work orders
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {data.recentWorkOrders.length === 0 ? (
            <li className="text-zinc-500">No work orders yet.</li>
          ) : (
            data.recentWorkOrders.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/magiclog/work-order/${w.id}`}
                  className="text-zinc-800 hover:text-orange-600"
                >
                  {w.task_name || w.competence_name} —{" "}
                  {new Date(w.created_at).toLocaleDateString()}{" "}
                  {w.hours != null ? `— ${w.hours}hrs` : ""}{" "}
                  {w.status === "signed" ? "✓" : "pending sig"}
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href="/magiclog/new" className="btn-primary inline-flex">
          + New work order
        </Link>
        <Link href="/magiclog/export" className="btn-ghost inline-flex">
          Export &amp; print
        </Link>
      </section>

      <FormError message={error} />
    </div>
  );
}

