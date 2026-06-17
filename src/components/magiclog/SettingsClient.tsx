"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  MAGICLOG_COMPULSORY_TRADES,
  MAGICLOG_OPTIONAL_TRADES,
  MAGICLOG_PROVINCES,
  MAGICLOG_TRADES,
  isCompulsoryCertificationTrade
} from "@/lib/magiclog/constants";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { FormError } from "@/components/FormError";
import type { MagicLogUserProfile } from "@/lib/magiclog/types";

export function SettingsClient({ initialProfile }: { initialProfile: MagicLogUserProfile }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [profile, setProfile] = useState(initialProfile);
  const [trade, setTrade] = useState(initialProfile.trade ?? MAGICLOG_TRADES[0]);
  const [showTradeWarning, setShowTradeWarning] = useState(false);
  const [pendingTrade, setPendingTrade] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setError(null);
    setSaved(false);
    setLoading(true);
    try {
      const res = await fetch("/api/magiclog/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      if (j.profile) setProfile(j.profile as MagicLogUserProfile);
      setSaved(true);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  function onTradeChange(next: string) {
    if (next === trade) return;
    setPendingTrade(next);
    setShowTradeWarning(true);
  }

  function confirmTradeChange() {
    if (!pendingTrade) return;
    setTrade(pendingTrade);
    setShowTradeWarning(false);
    void save({ trade: pendingTrade });
    setPendingTrade(null);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.assign("/");
  }

  return (
    <section className="space-y-6">
      <header>
        <Link href="/magiclog/dashboard" className="text-xs text-zinc-500 hover:text-zinc-800">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">Update your Magic Log profile and account.</p>
      </header>

      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save({
            ait_id: (e.currentTarget.elements.namedItem("ait_id") as HTMLInputElement).value,
            trade,
            current_period: Number(
              (e.currentTarget.elements.namedItem("current_period") as HTMLSelectElement).value
            ),
            apprenticeship_start_date: (
              e.currentTarget.elements.namedItem("start_date") as HTMLInputElement
            ).value,
            province: (e.currentTarget.elements.namedItem("province") as HTMLSelectElement)
              .value,
            sponsor_name: (e.currentTarget.elements.namedItem("sponsor_name") as HTMLInputElement)
              .value,
            sponsor_phone: (
              e.currentTarget.elements.namedItem("sponsor_phone") as HTMLInputElement
            ).value,
            is_journeyman: (e.currentTarget.elements.namedItem("is_journeyman") as HTMLInputElement)
              .checked,
            journeyman_certificate_number: (
              e.currentTarget.elements.namedItem("journeyman_cert") as HTMLInputElement
            ).value,
            default_mentor_name: (
              e.currentTarget.elements.namedItem("default_mentor_name") as HTMLInputElement
            ).value,
            default_mentor_phone: (
              e.currentTarget.elements.namedItem("default_mentor_phone") as HTMLInputElement
            ).value
          });
        }}
      >
        <h2 className="text-sm font-semibold">Profile</h2>

        <label className="block text-sm">
          Province
          <select
            name="province"
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            defaultValue={profile.province ?? "alberta"}
          >
            {MAGICLOG_PROVINCES.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.available}>
                {p.label}
                {!p.available ? " (coming soon)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          AIT ID
          <input name="ait_id" className="mt-1 w-full" defaultValue={profile.ait_id ?? ""} required />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Trade</legend>
          <p className="text-xs text-zinc-500">
            {isCompulsoryCertificationTrade(trade)
              ? "Compulsory certification — period hour targets are set for your trade."
              : "Optional certification — confirm hour targets with your sponsor."}
          </p>
          <p className="text-xs font-medium text-zinc-600">Compulsory certification</p>
          {MAGICLOG_COMPULSORY_TRADES.map((t) => (
            <label key={t} className="ml-province-option">
              <input
                type="radio"
                className="ml-province-radio"
                name="trade_radio"
                checked={trade === t}
                onChange={() => onTradeChange(t)}
              />
              <span className="ml-province-label">{t}</span>
            </label>
          ))}
          <p className="text-xs font-medium text-zinc-600">Optional certification</p>
          {MAGICLOG_OPTIONAL_TRADES.map((t) => (
            <label key={t} className="ml-province-option">
              <input
                type="radio"
                className="ml-province-radio"
                name="trade_radio"
                checked={trade === t}
                onChange={() => onTradeChange(t)}
              />
              <span className="ml-province-label">{t}</span>
            </label>
          ))}
        </fieldset>

        <label className="block text-sm">
          Current period
          <select
            name="current_period"
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            defaultValue={String(profile.current_period ?? 1)}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                Period {n}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          Apprenticeship start date
          <input
            type="date"
            name="start_date"
            className="mt-1 w-full"
            defaultValue={profile.apprenticeship_start_date?.slice(0, 10) ?? ""}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_journeyman"
            defaultChecked={Boolean(profile.is_journeyman)}
          />
          I am a journeyman (red seal / certificate holder)
        </label>

        <label className="block text-sm">
          Journeyman certificate number (optional)
          <input
            name="journeyman_cert"
            className="mt-1 w-full"
            defaultValue={profile.journeyman_certificate_number ?? ""}
          />
        </label>

        <h2 className="pt-2 text-sm font-semibold">Sponsor / mentor defaults</h2>

        <label className="block text-sm">
          Sponsor name
          <input
            name="sponsor_name"
            className="mt-1 w-full"
            defaultValue={profile.sponsor_name ?? ""}
          />
        </label>

        <label className="block text-sm">
          Sponsor phone
          <input
            name="sponsor_phone"
            type="tel"
            className="mt-1 w-full"
            defaultValue={profile.sponsor_phone ?? ""}
          />
        </label>

        <label className="block text-sm">
          Default mentor name (for signatures)
          <input
            name="default_mentor_name"
            className="mt-1 w-full"
            defaultValue={profile.default_mentor_name ?? profile.sponsor_name ?? ""}
          />
        </label>

        <label className="block text-sm">
          Default mentor phone (for SMS sign link)
          <input
            name="default_mentor_phone"
            type="tel"
            className="mt-1 w-full"
            defaultValue={profile.default_mentor_phone ?? profile.sponsor_phone ?? ""}
          />
        </label>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Saving…" : "Save changes"}
        </button>
        {saved ? <p className="text-sm text-green-700">Saved.</p> : null}
      </form>

      {showTradeWarning ? (
        <div className="card space-y-3 border-amber-200 bg-amber-50 p-5" role="alertdialog">
          <h2 className="text-sm font-semibold text-amber-900">Change trade?</h2>
          <p className="text-sm text-amber-800">
            Changing your trade updates period hour requirements and competence targets. Confirm
            only if you have switched programs.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={confirmTradeChange}>
              Yes, change trade
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setShowTradeWarning(false);
                setPendingTrade(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Account</h2>
        <p className="mt-1 text-sm text-zinc-600">{profile.email}</p>
        <button type="button" className="btn-ghost mt-4" onClick={() => void logout()}>
          Log out
        </button>
      </section>

      <FormError message={error} />
    </section>
  );
}
