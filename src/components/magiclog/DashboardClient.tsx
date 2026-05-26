"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FormError } from "@/components/FormError";
import { resolveMagicLogSubscriptionUi } from "@/lib/magiclog/subscriptionUi";
import { PeriodChecklistCard } from "@/components/magiclog/PeriodChecklistCard";
import { isCompulsoryCertificationTrade } from "@/lib/magiclog/constants";

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
  subscriptionStatus: string;
  subscriptionCreatedAt: string | null;
  recentWorkOrders: Array<{
    id: string;
    task_name: string | null;
    competence_name: string;
    hours: number | null;
    status: string;
    period: number;
    created_at: string;
  }>;
};

function formatHours(n: number): string {
  return Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 });
}

function formatEstCompletion(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const m = raw.match(/([A-Za-z]{3,})\s+(\d{4})/);
    return m ? `${m[1]} ${m[2]}` : raw;
  }
  return d.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
}

function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
      />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 19V11M10 19V7M15 19v-5M20 19V5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconExport() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v10m0 0 4-4m-4 4-4M5 21h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMic() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8h3l2-2h6l2 2h3v12H4V8Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.25" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconType() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6h14M5 12h10M5 18h6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSteps() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M10 6l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

const INPUT_METHODS = [
  {
    href: "/magiclog/new?mode=voice",
    title: "Record voice",
    subtitle: "Say it in one sentence",
    Icon: IconMic
  },
  {
    href: "/magiclog/new?mode=photo",
    title: "Take photo",
    subtitle: "Snap your work",
    Icon: IconCamera
  },
  {
    href: "/magiclog/new?mode=type",
    title: "Type it",
    subtitle: "Enter task manually",
    Icon: IconType
  },
  {
    href: "/magiclog/new?mode=learn",
    featured: true,
    title: "Learn with steps",
    subtitle: "AI steps + video guide",
    Icon: IconSteps
  }
] as const;

export function DashboardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    fetch("/api/magiclog/dashboard")
      .then((r) => r.json())
      .then((j) => {
        if (j.profile && !j.profile.bluebook_onboarding_complete) {
          router.replace("/magiclog/onboarding");
          return;
        }
        if (j.error) {
          if (j.error === "Profile not found") {
            router.replace("/magiclog/onboarding");
            return;
          }
          throw new Error(j.error);
        }
        setData(j as DashboardData);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      });
  }, [router]);

  const filteredOrders = useMemo(() => {
    if (!data) return [];
    if (periodFilter === "all") return data.recentWorkOrders;
    const p = Number(periodFilter);
    return data.recentWorkOrders.filter((w) => w.period === p);
  }, [data, periodFilter]);

  const recentPreview = useMemo(() => {
    if (!data) return [];
    return data.recentWorkOrders.slice(0, 3);
  }, [data]);

  async function startSubscriptionCheckout() {
    setCheckoutLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/magiclog/checkout", { method: "POST" });
      const text = await res.text();
      let j: { error?: string; url?: string } = {};
      if (text.trim()) {
        j = JSON.parse(text) as { error?: string; url?: string };
      }
      if (!res.ok) throw new Error(j.error ?? "Checkout failed");
      if (j.url) window.location.href = j.url;
      else throw new Error("No checkout URL returned");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setCheckoutLoading(false);
    }
  }

  if (!data) {
    return (
      <div className="ml-dashboard">
        <aside className="ml-dashboard-sidebar" aria-label="Main navigation">
          <div className="ml-sidebar-top">
            <div className="ml-sidebar-icon ml-sidebar-icon--active">
              <IconHome active />
            </div>
            <a className="ml-sidebar-icon" href="#ml-period-progress" aria-hidden tabIndex={-1}>
              <IconChart />
            </a>
            <span className="ml-sidebar-icon" aria-hidden>
              <IconExport />
            </span>
          </div>
        </aside>
        <div className="ml-dashboard-main">
          <FormError message={error} />
          {!error ? <p className="ml-dashboard-loading">Loading…</p> : null}
        </div>
      </div>
    );
  }

  const hoursPct = Math.min(
    100,
    Math.round((data.progress.total_hours / data.requirements.hoursRequired) * 100)
  );
  const estCompletion = formatEstCompletion(data.estimatedCompletion);
  const displayName = data.profile.email?.split("@")[0] ?? "there";
  const provinceLabel =
    data.profile.province === "alberta"
      ? "Alberta"
      : data.profile.province
        ? data.profile.province.charAt(0).toUpperCase() + data.profile.province.slice(1)
        : "";

  const subscription = resolveMagicLogSubscriptionUi({
    status: data.subscriptionStatus,
    subscriptionCreatedAt: data.subscriptionCreatedAt,
    onboardingComplete: data.profile.bluebook_onboarding_complete
  });

  return (
    <div className="ml-dashboard">
      <aside className="ml-dashboard-sidebar" aria-label="Main navigation">
        <div className="ml-sidebar-top">
          <Link
            href="/magiclog/dashboard"
            className={`ml-sidebar-icon ${pathname === "/magiclog/dashboard" ? "ml-sidebar-icon--active" : ""}`}
            aria-label="Home"
            aria-current={pathname === "/magiclog/dashboard" ? "page" : undefined}
          >
            <IconHome active={pathname === "/magiclog/dashboard"} />
          </Link>
          <a href="#ml-period-progress" className="ml-sidebar-icon" aria-label="Progress">
            <IconChart />
          </a>
          <Link href="/magiclog/export" className="ml-sidebar-icon" aria-label="Export">
            <IconExport />
          </Link>
        </div>
        <Link
          href="/magiclog/settings"
          className="ml-sidebar-icon ml-sidebar-icon--bottom"
          aria-label="Settings"
        >
          <IconSettings />
        </Link>
      </aside>

      <div className="ml-dashboard-main">
        <header className="ml-dashboard-hero">
          <p className="ml-dashboard-greeting">
            Hi {displayName} <span aria-hidden>👋</span>
          </p>
          <p className="ml-dashboard-context">
            {data.profile.trade ?? "Trade"} · Period {data.period}
            {provinceLabel ? ` · ${provinceLabel}` : ""}
          </p>
          <h1 className="ml-dashboard-title">What did you work on today?</h1>
          <p className="ml-dashboard-subtitle">Log your hours — speak, snap, or type</p>
        </header>

        <div className="ml-input-grid">
          {INPUT_METHODS.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className={`ml-input-card ${"featured" in item && item.featured ? "ml-input-card--featured" : ""}`}
            >
              <span className="ml-input-card-icon" aria-hidden>
                <item.Icon />
              </span>
              <span className="ml-input-card-title">{item.title}</span>
              <span className="ml-input-card-sub">{item.subtitle}</span>
            </Link>
          ))}
        </div>

        {recentPreview.length > 0 ? (
          <section className="ml-recent-strip" aria-label="Recent work orders">
            <p className="ml-recent-strip-label">Recent</p>
            <ul className="ml-recent-strip-list">
              {recentPreview.map((w) => (
                <li key={w.id}>
                  <Link href={`/magiclog/work-order/${w.id}`} className="ml-recent-strip-item">
                    <span className="ml-recent-strip-name">
                      {w.task_name || w.competence_name}
                    </span>
                    <span className="ml-recent-strip-meta">
                      {w.status === "signed" ? "Signed" : "Pending"}
                      {w.hours != null ? ` · ${w.hours} hrs` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {subscription.bannerText ? (
          <p className="ml-trial-banner" role="status">
            {subscription.bannerText}
          </p>
        ) : null}

        <section id="ml-period-progress" className="ml-progress-card">
          <div className="ml-progress-card-head">
            <span className="ml-progress-label">Period {data.period} progress</span>
            <span className="ml-progress-hours">
              {formatHours(data.progress.total_hours)} /{" "}
              {formatHours(data.requirements.hoursRequired)} hrs
            </span>
          </div>
          <div
            className="ml-progress-track"
            role="progressbar"
            aria-valuenow={hoursPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="ml-progress-fill" style={{ width: `${hoursPct}%` }} />
          </div>
          <p className="ml-progress-competences">
            Mandatory competences: {data.progress.mandatory_completed}/
            {data.requirements.mandatoryRequired} · Optional: {data.progress.optional_completed}/
            {data.requirements.optionalRequired}
            {isCompulsoryCertificationTrade(data.profile.trade)
              ? " · Trade-certified hour targets"
              : " · Self-reported hour targets"}
          </p>
          {!estCompletion && hoursPct < 10 && !data.progress.period_complete ? (
            <p className="ml-progress-est">Keep logging to see estimate</p>
          ) : estCompletion ? (
            <p className="ml-progress-est">Est. period completion {estCompletion}</p>
          ) : null}
          {data.profile.province === "alberta" ? (
            <p className="ml-progress-est">
              <Link href="/magiclog/grants" className="font-medium text-[#1D9E75] hover:underline">
                View Alberta grants &amp; awards →
              </Link>
            </p>
          ) : null}
        </section>

        <PeriodChecklistCard period={data.period} />

        <section className="ml-orders-section">
          <div className="ml-orders-head">
            <h2 className="ml-orders-title">All work orders</h2>
            <select
              className="ml-orders-filter"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              aria-label="Filter by period"
            >
              <option value="all">All periods</option>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={String(n)}>
                  Period {n}
                </option>
              ))}
            </select>
          </div>

          <ul className="ml-orders-list">
            {filteredOrders.length === 0 ? (
              <li className="ml-order-card ml-order-card--empty">
                <p>No work orders yet. Start with Record voice or Type it above.</p>
              </li>
            ) : (
              filteredOrders.map((w) => {
                const signed = w.status === "signed";
                return (
                  <li key={w.id}>
                    <Link href={`/magiclog/work-order/${w.id}`} className="ml-order-card">
                      <span className="ml-order-icon" aria-hidden>
                        <IconSteps />
                      </span>
                      <span className="ml-order-body">
                        <span className="ml-order-name">{w.task_name || w.competence_name}</span>
                        <span className="ml-order-meta">
                          Period {w.period}
                          {w.hours != null ? ` · ${w.hours} hrs` : ""} · {formatOrderDate(w.created_at)}
                        </span>
                      </span>
                      <span
                        className={`ml-order-badge ${signed ? "ml-order-badge--signed" : "ml-order-badge--pending"}`}
                      >
                        {signed ? "Signed" : "Pending"}
                      </span>
                      <span className="ml-order-chevron" aria-hidden>
                        <IconChevron />
                      </span>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        {subscription.showSubscribeCta ? (
          <section className="ml-subscribe-cta">
            <button
              type="button"
              className="ml-subscribe-btn"
              disabled={checkoutLoading}
              onClick={() => void startSubscriptionCheckout()}
            >
              {checkoutLoading ? "Loading…" : subscription.subscribeCtaLabel}
            </button>
          </section>
        ) : null}

        <FormError message={error} />
      </div>
    </div>
  );
}
