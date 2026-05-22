"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignaturePad } from "@/components/magiclog/SignaturePad";
import { FormError } from "@/components/FormError";
import {
  formatWorkOrderStartDate,
  isQuickLogWorkOrder,
  quickLogWorkedDate,
  workOrderStartDateIso
} from "@/lib/magiclog/workOrderMode";
import { isWorkOrderEditable, isWorkOrderLocked } from "@/lib/magiclog/workOrderStatus";
import type {
  CompetenceType,
  MagicLogAiStep,
  MagicLogUserProfile,
  MagicLogVideoRef,
  MagicLogWorkOrder
} from "@/lib/magiclog/types";

type Tab = "ait" | "learning";

function syncEditFields(wo: MagicLogWorkOrder) {
  const steps = (wo.ai_steps ?? []) as MagicLogAiStep[];
  return {
    taskName: wo.competence_name || wo.task_name || "",
    competenceType: wo.competence_type as CompetenceType,
    period: wo.period,
    hours: wo.hours != null ? String(wo.hours) : "",
    workedDate:
      quickLogWorkedDate(wo) ??
      (workOrderStartDateIso(wo) || new Date().toISOString().slice(0, 10)),
    steps: steps.map((s) => ({ ...s }))
  };
}

export function WorkOrderClient({ workOrderId }: { workOrderId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("ait");
  const [workOrder, setWorkOrder] = useState<MagicLogWorkOrder | null>(null);
  const [profile, setProfile] = useState<Partial<MagicLogUserProfile> | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signaturePath, setSignaturePath] = useState<string | null>(null);
  const [mentorName, setMentorName] = useState("");
  const [editTaskName, setEditTaskName] = useState("");
  const [editCompetenceType, setEditCompetenceType] = useState<CompetenceType>("mandatory");
  const [editPeriod, setEditPeriod] = useState(1);
  const [editHours, setEditHours] = useState("");
  const [editWorkedDate, setEditWorkedDate] = useState("");
  const [editSteps, setEditSteps] = useState<MagicLogAiStep[]>([]);
  const [showPad, setShowPad] = useState(false);
  const [showHoursPrompt, setShowHoursPrompt] = useState(false);
  const [hours, setHours] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/magiclog/work-orders/${workOrderId}`);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Failed to load");
    const wo = j.workOrder as MagicLogWorkOrder;
    setWorkOrder(wo);
    setProfile(j.profile);
    setSignatureUrl(j.mentorSignatureSignedUrl ?? null);
    if (wo.mentor_signature_url) {
      setSignaturePath(wo.mentor_signature_url);
    }
    if (wo.mentor_name) setMentorName(wo.mentor_name);
    const synced = syncEditFields(wo);
    setEditTaskName(synced.taskName);
    setEditCompetenceType(synced.competenceType);
    setEditPeriod(synced.period);
    setEditHours(synced.hours);
    setEditWorkedDate(synced.workedDate);
    setEditSteps(synced.steps);
    if (isQuickLogWorkOrder(wo) && wo.hours != null) {
      setHours(String(wo.hours));
    }
  }, [workOrderId]);

  useEffect(() => {
    load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load");
    });
  }, [load]);

  const video = useMemo(() => {
    const urls = workOrder?.video_urls as MagicLogVideoRef[] | null;
    return urls?.[0] ?? null;
  }, [workOrder]);

  const editable = workOrder ? isWorkOrderEditable(workOrder.status) : false;
  const locked = workOrder ? isWorkOrderLocked(workOrder.status) : false;

  async function saveEdits() {
    if (!workOrder || !editable) return;
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        taskName: editTaskName.trim(),
        competenceType: editCompetenceType,
        period: editPeriod,
        mentor_name: mentorName.trim() || null,
        ai_steps: editSteps
      };
      const quickLog = isQuickLogWorkOrder(workOrder);
      if (quickLog) {
        payload.workedDate = editWorkedDate;
        const h = Number(editHours);
        if (!Number.isFinite(h) || h <= 0) {
          throw new Error("Enter valid hours");
        }
        payload.hours = h;
      } else if (editHours.trim()) {
        const h = Number(editHours);
        if (Number.isFinite(h) && h > 0) payload.hours = h;
      }
      const res = await fetch(`/api/magiclog/work-orders/${workOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      await load();
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function submitSignOff(h: number, sigPath: string | null) {
    if (!Number.isFinite(h) || h <= 0) {
      setError("Enter valid hours for this task");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/magiclog/work-orders/${workOrderId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours: h,
          mentorSignatureUrl: sigPath,
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

  async function uploadSignature(file: File | Blob) {
    if (locked) return;
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file, "signature.png");
      const res = await fetch(`/api/magiclog/work-orders/${workOrderId}/signature`, {
        method: "POST",
        body: form
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      setSignaturePath(j.path);
      setSignatureUrl(j.signedUrl ?? null);
      const order = workOrder;
      if (order && isQuickLogWorkOrder(order) && order.hours != null) {
        setHours(String(order.hours));
        await submitSignOff(Number(order.hours), j.path as string);
        return;
      }
      setShowHoursPrompt(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function completeSign() {
    await submitSignOff(Number(hours), signaturePath);
  }

  if (!workOrder) {
    return (
      <section>
        <FormError message={error} />
        {!error ? <p className="text-sm text-zinc-600">Loading work order…</p> : null}
      </section>
    );
  }

  const period = editable ? editPeriod : workOrder.period;
  const competenceLabel = editable
    ? editTaskName
    : workOrder.competence_name || workOrder.task_name || "Task";
  const competenceType = editable ? editCompetenceType : workOrder.competence_type;
  const quickLog = isQuickLogWorkOrder(workOrder);
  const workedDate = editable && quickLog ? editWorkedDate : quickLogWorkedDate(workOrder);
  const startDateDisplay = formatWorkOrderStartDate(workOrder);
  const displayHours = locked
    ? workOrder.hours
    : quickLog
      ? editHours
      : workOrder.hours ?? editHours;
  const steps = editable ? editSteps : ((workOrder.ai_steps ?? []) as MagicLogAiStep[]);
  const hasLearning = !quickLog && steps.length > 0;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <section>
          <Link href="/magiclog/dashboard" className="text-xs text-zinc-500 hover:text-zinc-800">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{competenceLabel || "Work order"}</h1>
          <p className="text-sm text-zinc-600">
            Period {period} · {competenceType}
            {!locked ? (
              <>
                {" "}
                · <span className="font-medium text-amber-700">Draft (editable)</span>
              </>
            ) : null}
          </p>
        </section>
        {hasLearning ? (
          <nav className="flex rounded-lg border border-zinc-200 bg-white p-1 text-sm">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${tab === "ait" ? "bg-orange-500 text-white" : ""}`}
              onClick={() => setTab("ait")}
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
        ) : null}
      </header>

      {locked ? (
        <div className="bb-locked-banner" role="status">
          <p className="bb-locked-banner-title">Signed and locked</p>
          <p className="bb-locked-banner-desc">
            Hours, task name, start date, and all other fields are read-only and cannot be
            changed after mentor sign-off.
          </p>
        </div>
      ) : null}

      <section className="card space-y-4 p-5" aria-readonly={locked}>
        <h2 className="text-sm font-semibold">Work order details</h2>
        <fieldset disabled={locked} className="space-y-4 disabled:opacity-100">
          <label className="block text-sm font-medium">
            Task / competence name
            {editable ? (
              <input
                className="mt-1 w-full"
                value={editTaskName}
                onChange={(e) => setEditTaskName(e.target.value)}
              />
            ) : (
              <span className="bb-field-locked">{competenceLabel}</span>
            )}
          </label>
          <label className="block text-sm font-medium">
            Competence type
            {editable ? (
              <select
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                value={editCompetenceType}
                onChange={(e) =>
                  setEditCompetenceType(e.target.value as CompetenceType)
                }
              >
                <option value="mandatory">Mandatory</option>
                <option value="optional">Optional</option>
              </select>
            ) : (
              <span className="bb-field-locked">{competenceType}</span>
            )}
          </label>
          <label className="block text-sm font-medium">
            Start date
            {editable && quickLog ? (
              <input
                type="date"
                className="mt-1 w-full"
                value={editWorkedDate}
                onChange={(e) => setEditWorkedDate(e.target.value)}
              />
            ) : (
              <span className="bb-field-locked">{startDateDisplay}</span>
            )}
          </label>
          <label className="block text-sm font-medium">
            Hours
            {editable && !locked ? (
              quickLog ? (
                <input
                  type="number"
                  min={0.25}
                  step={0.25}
                  className="mt-1 w-full"
                  value={editHours}
                  onChange={(e) => setEditHours(e.target.value)}
                />
              ) : (
                <input
                  type="number"
                  min={0.25}
                  step={0.25}
                  className="mt-1 w-full"
                  value={editHours}
                  onChange={(e) => setEditHours(e.target.value)}
                  placeholder="Set when mentor signs"
                />
              )
            ) : (
              <span className="bb-field-locked">{displayHours ?? "—"}</span>
            )}
          </label>
          <label className="block text-sm font-medium">
            Period
            {editable ? (
              <select
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                value={editPeriod}
                onChange={(e) => setEditPeriod(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    Period {n}
                  </option>
                ))}
              </select>
            ) : (
              <span className="bb-field-locked">Period {period}</span>
            )}
          </label>
        </fieldset>
        {editable ? (
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !editTaskName.trim()}
            onClick={() => void saveEdits()}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        ) : null}
      </section>

      {tab === "ait" ? (
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
              Competence: <strong>{competenceLabel}</strong> ({competenceType})
            </p>
            {quickLog ? (
              <p>
                Quick log · {displayHours ?? "—"} hours
                {workedDate
                  ? ` · worked ${new Date(workedDate).toLocaleDateString("en-CA")}`
                  : ""}
              </p>
            ) : null}
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

      {tab === "learning" && hasLearning ? (
        <section className="space-y-4">
          {video ? (
            <p className="text-sm text-zinc-600">
              Video: {video.title}
              {video.channel ? ` · ${video.channel}` : ""}
            </p>
          ) : null}
          {steps.map((step, i) => (
            <article key={step.id ?? step.step_number} className="learning-step-card">
              {editable ? (
                <>
                  <label className="block text-sm font-semibold">
                    Step {step.step_number} title
                    <input
                      className="mt-1 w-full font-medium"
                      value={step.title}
                      onChange={(e) => {
                        const next = [...editSteps];
                        next[i] = { ...step, title: e.target.value };
                        setEditSteps(next);
                      }}
                    />
                  </label>
                  <label className="mt-2 block text-sm">
                    Description
                    <textarea
                      className="mt-1 min-h-[60px] w-full text-sm"
                      value={step.description}
                      onChange={(e) => {
                        const next = [...editSteps];
                        next[i] = { ...step, description: e.target.value };
                        setEditSteps(next);
                      }}
                    />
                  </label>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-semibold">
                    Step {step.step_number}: {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-700">{step.description}</p>
                </>
              )}
              {step.id && workOrder.include_video ? (
                <p className="mt-3 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/qr/${encodeURIComponent(step.id)}?surface=work-order&v=play`}
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
          ))}
          {editable ? (
            <button
              type="button"
              className="btn-ghost"
              disabled={saving}
              onClick={() => void saveEdits()}
            >
              {saving ? "Saving…" : "Save step changes"}
            </button>
          ) : null}
        </section>
      ) : null}

      {editable ? (
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
        <section className="card space-y-2 p-5">
          <p className="text-sm text-zinc-600">
            Mentor: {workOrder.mentor_name?.trim() || "—"}
          </p>
          {workOrder.signed_at ? (
            <p className="text-sm text-zinc-600">
              Signed on {new Date(workOrder.signed_at).toLocaleString("en-CA", {
                dateStyle: "medium",
                timeStyle: "short"
              })}
            </p>
          ) : null}
        </section>
      )}

      {showHoursPrompt && editable && !quickLog ? (
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
