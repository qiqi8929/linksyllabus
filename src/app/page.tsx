import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MagicLogLandingPage } from "@/components/landing/MagicLogLandingPage";
import { oauthCallbackRedirectPath } from "@/lib/magiclog/oauthCallback";
import "./magiclog-landing.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Magic Log — Never fill out your blue book again",
  description:
    "Digital apprentice record book for Canadian trades. Voice and photo logging, mentor signatures, and AIT-ready exports for Alberta apprentices.",
  other: {
    "p:domain_verify": "5e4b1cc9f935476bf76bac3225f0f9bb"
  }
};

export default function HomePage({
  searchParams
}: {
  searchParams?: { code?: string; next?: string };
}) {
  if (searchParams?.code) {
    redirect(oauthCallbackRedirectPath(searchParams.code, searchParams.next));
  }

  return <MagicLogLandingPage />;
}
