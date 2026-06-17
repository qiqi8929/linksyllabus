"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MAGICLOG_COMPULSORY_TRADES,
  MAGICLOG_OPTIONAL_TRADES,
  MAGICLOG_PROVINCES,
  magiclog_subscription
} from "@/lib/magiclog/constants";
import { FormError } from "@/components/FormError";

type Step = 1 | 2 | 3 | 4;

export function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [province, setProvince] = useState("alberta");
  const [aitId, setAitId] = useState("");
  const [trade, setTrade] = useState<string>(MAGICLOG_COMPULSORY_TRADES[0]);
  const [isJourneyman, setIsJourneyman] = useState(false);
  const [journeymanCert, setJourneymanCert] = useState("");
  const [currentPeriod, setCurrentPeriod] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorPhone, setSponsorPhone] = useState("");
  const [scannedName, setScannedName] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  async function saveProfile(partial: Record<string, unknown>) {
    const res = await fetch("/api/magiclog/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial)
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? "Failed to save profile");
    }
  }

  async function scanCover(file: File) {
    setError(null);
    setScanLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/magiclog/scan-cover", {
        method: "POST",
        body: form
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Scan failed");
      const f = j.fields as {
        name?: string | null;
        ait_id?: string | null;
        trade?: string | null;
        start_date?: string | null;
      };
      if (f.ait_id) setAitId(f.ait_id);
      if (f.trade) setTrade(f.trade);
      if (f.start_date) setStartDate(f.start_date);
      if (f.name) setScannedName(f.name);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Cover scan failed");
    } finally {
      setScanLoading(false);
    }
  }

  async function onNext() {
    setError(null);
    setLoading(true);
    try {
      if (step === 1) {
        await saveProfile({ province });
        setStep(2);
      } else if (step === 2) {
        if (!aitId.trim() || !trade.trim()) {
          throw new Error("AIT ID and trade are required.");
        }
        await saveProfile({
          ait_id: aitId,
          trade,
          current_period: currentPeriod,
          apprenticeship_start_date: startDate || null
        });
        setStep(3);
      } else if (step === 3) {
        await saveProfile({
          sponsor_name: sponsorName,
          sponsor_phone: sponsorPhone,
          is_journeyman: isJourneyman,
          journeyman_certificate_number: journeymanCert.trim() || null,
          default_mentor_name: sponsorName.trim() || null,
          default_mentor_phone: sponsorPhone.trim() || null
        });
        setStep(4);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function startCheckout() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/magiclog/checkout", { method: "POST" });
      const text = await res.text();
      let j: { error?: string; url?: string } = {};
      if (text.trim()) {
        try {
          j = JSON.parse(text) as { error?: string; url?: string };
        } catch {
          throw new Error(
            res.ok
              ? "Invalid response from checkout"
              : `Checkout failed (${res.status})`
          );
        }
      } else if (!res.ok) {
        throw new Error(`Checkout failed (${res.status})`);
      }
      if (!res.ok) throw new Error(j.error ?? "Checkout failed");
      if (j.url) window.location.href = j.url;
      else throw new Error("No checkout URL returned");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  async function finishWithoutCheckout() {
    setLoading(true);
    try {
      await saveProfile({ bluebook_onboarding_complete: true });
      router.replace("/magiclog/dashboard");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to complete onboarding");
    } finally {
      setLoading(false);
    }
  }

  if (searchParams.get("checkout") === "success") {
    void finishWithoutCheckout();
  }

  return (
    <div className="ml-onboarding card mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold">Set up Magic Log</h1>
      <p className="mt-1 text-sm text-zinc-600">Step {step} of 4</p>

      {step === 1 ? (
        <fieldset className="mt-6 space-y-3 border-0 p-0">
          <legend className="text-sm font-medium">Select your province</legend>
          {MAGICLOG_PROVINCES.map((p) => {
            const lineLabel = p.available ? p.label : `${p.label} (coming soon)`;
            return (
              <label key={p.id} className="ml-province-option">
                <input
                  type="radio"
                  name="province"
                  className="ml-province-radio"
                  value={p.id}
                  checked={province === p.id}
                  disabled={!p.available}
                  onChange={() => setProvince(p.id)}
                />
                <span className="ml-province-label">{lineLabel}</span>
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {step === 2 ? (
        <div className="mt-6 space-y-3">
          <section className="bb-scan-box">
            <p className="text-sm font-medium text-[#1e4b8f]">
              Have your blue book handy?
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Snap a photo to fill in your details instantly.
            </p>
            <label className="btn-ghost mt-3 inline-flex cursor-pointer text-sm">
              {scanLoading ? "Scanning…" : "Upload photo or take picture"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={scanLoading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void scanCover(f);
                  e.target.value = "";
                }}
              />
            </label>
            {scannedName ? (
              <p className="mt-2 text-xs text-green-700">
                Detected apprentice: {scannedName}
              </p>
            ) : null}
          </section>
          <div className="space-y-1">
            <label className="text-sm font-medium">AIT ID number</label>
            <input value={aitId} onChange={(e) => setAitId(e.target.value)} required />
          </div>
          <fieldset className="space-y-2 border-0 p-0">
            <legend className="text-sm font-medium">Trade</legend>
            <p className="text-xs text-zinc-500">Compulsory certification trades use AIT hour targets.</p>
            {MAGICLOG_COMPULSORY_TRADES.map((t) => (
                <label key={t} className="ml-province-option">
                  <input
                    type="radio"
                    className="ml-province-radio"
                    name="onboarding_trade"
                    value={t}
                    checked={trade === t}
                    onChange={() => setTrade(t)}
                  />
                  <span className="ml-province-label">
                    {t} <span className="text-zinc-400" aria-hidden>🔒</span>
                  </span>
                </label>
              ))}
            <p className="pt-1 text-xs font-medium text-zinc-600">Optional certification</p>
            {MAGICLOG_OPTIONAL_TRADES.map((t) => (
              <label key={t} className="ml-province-option">
                <input
                  type="radio"
                  className="ml-province-radio"
                  name="onboarding_trade"
                  value={t}
                  checked={trade === t}
                  onChange={() => setTrade(t)}
                />
                <span className="ml-province-label">{t}</span>
              </label>
            ))}
          </fieldset>
          <div className="space-y-1">
            <label className="text-sm font-medium">Current period</label>
            <select
              value={currentPeriod}
              onChange={(e) => setCurrentPeriod(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  Period {n}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Apprenticeship start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="mt-6 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isJourneyman}
              onChange={(e) => setIsJourneyman(e.target.checked)}
            />
            I am a journeyman (certificate holder)
          </label>
          {isJourneyman ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Journeyman certificate number</label>
              <input
                value={journeymanCert}
                onChange={(e) => setJourneymanCert(e.target.value)}
                placeholder="Optional"
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="text-sm font-medium">Sponsor / employer name</label>
            <input
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Sponsor phone</label>
            <input
              value={sponsorPhone}
              onChange={(e) => setSponsorPhone(e.target.value)}
              type="tel"
            />
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-zinc-700">
            <strong>{magiclog_subscription.trialDays}-day free trial</strong>, then $
            {magiclog_subscription.monthlyUsd}/month. Cancel anytime.
          </p>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={loading}
            onClick={startCheckout}
          >
            Start free trial with Stripe
          </button>
          <button
            type="button"
            className="btn-ghost w-full text-sm"
            disabled={loading}
            onClick={finishWithoutCheckout}
          >
            Skip for now (dev / already subscribed)
          </button>
        </div>
      ) : null}

      <FormError message={error} />

      {step < 4 ? (
        <div className="mt-6 flex justify-end">
          <button type="button" className="btn-primary" disabled={loading} onClick={onNext}>
            {loading ? "Saving…" : "Continue"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
