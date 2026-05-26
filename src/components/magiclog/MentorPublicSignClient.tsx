"use client";

import { useState } from "react";
import { MentorPublicSignCanvas } from "@/components/magiclog/MentorPublicSignCanvas";
import type { PublicSignApprentice, PublicSignWorkOrder } from "@/lib/magiclog/publicMentorSign";

type MentorPublicSignClientProps = {
  order: PublicSignWorkOrder;
  apprentice: PublicSignApprentice;
  token: string;
};

function taskTitle(order: PublicSignWorkOrder): string {
  return order.task_name?.trim() || order.competence_name;
}

export function MentorPublicSignClient({
  order,
  apprentice,
  token
}: MentorPublicSignClientProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleConfirm(base64Png: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/magiclog/sign/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signatureBase64: base64Png })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save signature");
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save signature");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mb-4 text-4xl" aria-hidden>
          ✓
        </div>
        <h1 className="text-2xl font-bold text-zinc-900">Thank you!</h1>
        <p className="mt-3 text-zinc-600">
          Your signature has been recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <p className="text-center text-sm font-semibold uppercase tracking-wide text-blue-700">
        Magic Log — Mentor sign-off
      </p>
      <h1 className="mt-2 text-center text-2xl font-bold text-zinc-900">{taskTitle(order)}</h1>

      <div className="mt-6 space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Apprentice</p>
          <p className="text-base font-medium text-zinc-900">{apprentice.displayName}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hours</p>
          <p className="text-base font-medium text-zinc-900">
            {order.hours != null ? `${order.hours} hrs` : "—"}
          </p>
        </div>
      </div>

      <p className="mt-8 text-center text-sm text-zinc-600">
        Please sign below to verify this work.
      </p>

      <div className="mt-4">
        <MentorPublicSignCanvas disabled={submitting} onConfirm={(b64) => void handleConfirm(b64)} />
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {submitting ? (
        <p className="mt-4 text-center text-sm font-medium text-blue-700">Saving signature…</p>
      ) : null}
    </div>
  );
}
