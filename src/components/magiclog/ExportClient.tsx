"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SubmitToAitButton } from "@/components/magiclog/export/SubmitToAitButton";
import { FormError } from "@/components/FormError";

type ExportMeta = {
  period: number;
  currentPeriod: number;
};

export function ExportClient() {
  const [period, setPeriod] = useState(1);
  const [meta, setMeta] = useState<ExportMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/magiclog/profile")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        const p = j.profile?.current_period ?? 1;
        setPeriod(p);
        setMeta({ period: p, currentPeriod: p });
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load profile");
      });
  }, []);

  function printUrl(type: string) {
    return `/magiclog/export/print?type=${type}&period=${period}`;
  }

  return (
    <section className="space-y-8">
      <header>
        <Link href="/magiclog/dashboard" className="text-xs text-zinc-500 hover:text-zinc-800">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Export &amp; print</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Alberta AIT period-end documents and personal records. Individual work-order mentor
          signatures stay with you — only the two-page period package goes to AIT.
        </p>
      </header>

      <label className="block text-sm">
        <span className="font-medium">Period</span>
        <select
          className="mt-1 w-full max-w-xs rounded-lg border border-zinc-200 px-3 py-2"
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              Period {n}
              {meta?.currentPeriod === n ? " (current)" : ""}
            </option>
          ))}
        </select>
      </label>

      <section className="grid gap-4 md:grid-cols-1">
        <article className="card flex flex-col p-5">
          <h2 className="text-base font-semibold text-[#1e4b8f]">
            1. End of period submission package
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Two AIT pages: sponsor competence endorsement + hours verification. Print or save as
            PDF, have your sponsor sign, then submit through MyTradesecrets.
          </p>
          <a
            href={printUrl("ait-submission")}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-4 inline-flex w-fit"
          >
            Open for print
          </a>
          <SubmitToAitButton printHref={printUrl("ait-submission")} />
        </article>

        <article className="card p-5">
          <h2 className="text-base font-semibold">2. Personal record</h2>
          <p className="mt-2 text-sm text-zinc-600">
            All signed work orders with mentor signatures and learning steps — for your files only.
          </p>
          <a
            href={printUrl("personal-record")}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-4 inline-flex"
          >
            Open for print
          </a>
        </article>

        <article className="card p-5">
          <h2 className="text-base font-semibold">3. Progress summary</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Hours and competences vs requirements, plus estimated completion date.
          </p>
          <a
            href={printUrl("progress-summary")}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-4 inline-flex"
          >
            Open for print
          </a>
        </article>
      </section>

      <FormError message={error} />
    </section>
  );
}
