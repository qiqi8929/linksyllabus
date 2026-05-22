import { magiclog_subscription } from "@/lib/magiclog/constants";

export type MagicLogSubscriptionUi = {
  status: string;
  trialDaysRemaining: number | null;
  bannerText: string | null;
  showSubscribeCta: boolean;
  subscribeCtaLabel: string;
};

function trialDaysRemainingFrom(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null;
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + magiclog_subscription.trialDays);
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function resolveMagicLogSubscriptionUi(params: {
  status: string | null | undefined;
  subscriptionCreatedAt?: string | null;
  onboardingComplete: boolean;
}): MagicLogSubscriptionUi {
  const status = (params.status ?? "inactive").toLowerCase();
  const inactive = { showSubscribeCta: false, subscribeCtaLabel: "", bannerText: null, trialDaysRemaining: null };

  if (!params.onboardingComplete) {
    return { status, ...inactive };
  }

  if (status === "active") {
    return { status, ...inactive };
  }

  if (status === "trialing") {
    const days = trialDaysRemainingFrom(params.subscriptionCreatedAt);
    const bannerText =
      days === null
        ? "Free trial active"
        : days === 0
          ? "Your free trial ends today"
          : `You have ${days} day${days === 1 ? "" : "s"} left in your free trial`;
    return {
      status,
      trialDaysRemaining: days,
      bannerText,
      showSubscribeCta: true,
      subscribeCtaLabel: "Manage subscription"
    };
  }

  return {
    status,
    trialDaysRemaining: null,
    bannerText: null,
    showSubscribeCta: true,
    subscribeCtaLabel: "Subscribe to Magic Log"
  };
}
