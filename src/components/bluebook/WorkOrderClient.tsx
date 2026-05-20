"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignaturePad } from "@/components/bluebook/SignaturePad";
import { FormError } from "@/components/FormError";
import type {
  BluebookAiStep,
  BluebookUserProfile,
  BluebookVideoRef,
  BluebookWorkOrder
} from "@/lib/bluebook/types";

type Tab = "bluebook" | "learning";

function youtubeUrlAt(url: string, startSec: number): string {
  try {
    const u = new URL(url);
    u.searchParams.set("t", String(Math.max(0, Math.floor(startSec))));
    return u.toString();
  } catch {
    return url;
  }
}

function stepStartSec(
  step: BluebookAiStep,
  index: number,
  steps: BluebookAiStep[],
  durationSec?: number
): number {
  if (step.start_time != null) return step.start_time;
  if (durationSec && durationSec > 0 && steps.length > 0) {
    return Math.floor((durationSec / steps.length) * index);
  }
  return index * 30;
}

export function WorkOrderClient({ workOrderId }: { workOrderId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("bluebook");
  const [workOrder, setWorkOrder] = useState<BluebookWorkOrder | null>(null);
  const [profile, setProfile] = useState<Partial<BluebookUserProfile> | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signaturePath, setSignaturePath] = useState<string | null>(null);
  const [mentorName, setMentorName] = useState("");
  const [showPad, setShowPad] = useState(false);
  const [showHoursPrompt, setShowHoursPrompt] = useState(false);
  const [hours, setHours] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/bluebook/work-orders/${workOrderId}`);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Failed to load");
    setWorkOrder(j.workOrder);
    setProfile(j.profile);
    setSignatureUrl(j.mentorSignatureSignedUrl ?? null);
    if (j.workOrder.mentor_signature_url) {
      setSignaturePath(j.workOrder.mentor_signature_url);
    }
    if (j.workOrder.mentor_name) setMentorName(j.workOrder.mentor_name);
  }, [workOrderId]);

  useEffect(() => {
    load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load");
    });
  }, [load]);

  const video = useMemo(() => {
    const urls = workOrder?.video_urls as BluebookVideoRef[] | null;
    return urls?.[0] ?? null;
  }, [workOrder]);

  const steps = (workOrder?.ai_steps ?? []) as BluebookAiStep[];

  async function uploadSignature(file: File | Blob) {
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file, "signature.png");
      const res = await fetch(`/api/bluebook/work-orders/${workOrderId}/signature`, {
        method: "POST",
        body: form
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      setSignaturePath(j.path);
      setSignatureUrl(j.signedUrl ?? null);
      setShowHoursPrompt(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function completeSign() {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) {
      setError("Enter valid hours for this task");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/bluebook/work-orders/${workOrderId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours: h,
          mentorSignatureUrl: signaturePath,
          mentorName: mentorName.trim() || undefined
        })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Sign failed");
      setShowHoursPrompt(false);
      await load();
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign failed");
    } finally {
      setLoading(false);
    }
  }

  if (!workOrder) {
    return (
      <section>
        <FormError message={error} />
        {!error ? <p className="text-sm text-zinc-600">Loading work order…</p> : null}
      </section>
    );
  }

  const period = workOrder.period;
  const signed = workOrder.status === "signed";
  const competenceLabel = workOrder.competence_name || workOrder.task_name || "Task";

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <section>
          <Link href="/bluebook/dashboard" className="text-xs text-zinc-500 hover:text-zinc-800">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{competenceLabel}</h1>
          <p className="text-sm text-zinc-600">
            Period {period} · {workOrder.competence_type} · {workOrder.status}
          </p>
        </section>
        <nav className="flex rounded-lg border border-zinc-200 bg-white p-1 text-sm">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 ${tab === "bluebook" ? "bg-orange-500 text-white" : ""}`}
            onClick={() => setTab("bluebook")}
          >
            My Bluebook
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 ${tab === "learning" ? "bg-orange-500 text-white" : ""}`}
            onClick={() => setTab("learning")}
          >
            My Learning
          </button>
        </nav>
      </header>

      {tab === "bluebook" ? (
        <section className="ait-sheet">
          <p className="ait-submit-badge">
            <span aria-hidden>👇</span>
            <span className="ait-submit-btn">Submit to AIT</span>
          </p>
          <section className="ait-body">
            <p>
              <strong>End of Period {period} Sponsor&apos;s Competence Endorsement:</strong>
            </p>
            <p>
              Competence: <strong>{competenceLabel}</strong> ({workOrder.competence_type})
            </p>
            <p>
              I am satisfied that (a) qualified mentor(s) has assessed competence for the
              apprentice and that the mentor(s) has determined that the apprentice has
              demonstrated competency.
            </p>
            <p>
              <strong>End of Period {period} Apprentice&apos;s Competence Acknowledgement:</strong>
            </p>
            <p>
              I acknowledge that a minimum of eight (8) competences have been completed.
            </p>
          </section>
          <section className="ait-sign-grid">
            <section>
              <p className="ait-field-label">Sponsor printed name and phone</p>
              <p>Name:</p>
              <span className="ait-line">{profile?.sponsor_name || " "}</span>
              <p>Phone number:</p>
              <span className="ait-line">{profile?.sponsor_phone || " "}</span>
            </section>
            <section>
              <p className="ait-field-label">Sponsor endorsement</p>
              <p>Signature:</p>
              {signatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signatureUrl} alt="Mentor signature" className="mb-2 max-h-16" />
              ) : (
                <span className="ait-line" />
              )}
              <p>Date:</p>
              <span className="ait-line">
                {workOrder.signed_at
                  ? new Date(workOrder.signed_at).toLocaleDateString()
                  : " "}
              </span>
            </section>
            <section>
              <p className="ait-field-label">Apprentice acknowledgement</p>
              <p>AIT identifier:</p>
              <span className="ait-line">{profile?.ait_id || " "}</span>
              <p>Signature:</p>
              <span className="ait-line" />
            </section>
          </section>
        </section>
      ) : null}

      {tab === "learning" ? (
        <section className="space-y-4">
          {video ? (
            <p className="text-sm text-zinc-600">
              Video: {video.title}
              {video.channel ? ` · ${video.channel}` : ""}
            </p>
          ) : null}
          {steps.map((step, i) => {
            const start = stepStartSec(step, i, steps, video?.durationSec);
            const watchUrl =
              video?.url && workOrder.include_video
                ? youtubeUrlAt(video.url, start)
                : null;
            return (
              <article key={step.step_number} className="learning-step-card">
                <h3 className="text-sm font-semibold">
                  Step {step.step_number}: {step.title}
                </h3>
                <p className="mt-1 text-sm text-zinc-700">{step.description}</p>
                {watchUrl ? (
                  <p className="mt-3 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/bluebook/qr?url=${encodeURIComponent(watchUrl)}`}
                      alt={`QR for step ${step.step_number}`}
                      width={96}
                      height={96}
                      className="h-24 w-24"
                    />
                    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Scan to watch
                    </span>
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}

      {!signed ? (
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold">Mentor signature</h2>
          <label className="block text-sm">
            Mentor name (optional)
            <input
              className="mt-1 w-full"
              value={mentorName}
              onChange={(e) => setMentorName(e.target.value)}
            />
          </label>
          <label className="btn-ghost inline-flex cursor-pointer">
            Upload photo of signed page
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadSignature(f);
              }}
            />
          </label>
          <button type="button" className="btn-ghost" onClick={() => setShowPad((v) => !v)}>
            Mentor signs on screen
          </button>
          {showPad ? (
            <SignaturePad
              onSave={async (blob) => {
                await uploadSignature(blob);
                setShowPad(false);
              }}
            />
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-green-700">
          Signed · {workOrder.hours} hours logged
        </p>
      )}

      {showHoursPrompt && !signed ? (
        <section className="card space-y-3 p-5">
          <p className="text-sm font-medium">How many hours did this task take?</p>
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="e.g. 2.5"
          />
          <button
            type="button"
            className="btn-primary"
            disabled={loading}
            onClick={completeSign}
          >
            {loading ? "Saving…" : "Complete sign-off"}
          </button>
        </section>
      ) : null}

      <FormError message={error} />
    </section>
  );
}
