import type { Metadata } from "next";
import { MagicLogLandingPage } from "@/components/landing/MagicLogLandingPage";
import "./magiclog-landing.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Magic Log — Log your apprenticeship hours in seconds",
  description:
    "Speak it. Snap it. Done. Log Alberta apprentice hours by voice or photo, get mentor sign-off, and export your AIT period package.",
  other: {
    "p:domain_verify": "5e4b1cc9f935476bf76bac3225f0f9bb"
  }
};

export default function HomePage() {
  return <MagicLogLandingPage />;
}
