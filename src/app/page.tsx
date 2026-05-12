import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { cache } from "react";
import { LandingComparisonLightbox } from "@/components/LandingComparisonLightbox";
import { env } from "@/lib/env";
import "./landing.css";

/** Avoid stale static HTML: landing copy is read at request time after deploy. */
export const dynamic = "force-dynamic";

const LEGACY_HERO_YOUTUBE_EMBED =
  "https://www.youtube.com/embed/q9WEi19Py9o?autoplay=1&mute=1&loop=1&playlist=q9WEi19Py9o&controls=0&modestbranding=1&playsinline=1";
const HERO_MEDIA_TOKEN = "{{HERO_MEDIA}}";
const COMPARISON_SECTION_TOKEN = "{{COMPARISON_SECTION}}";

const LANDING_COMPARISON_IMAGES: Array<{ src: string; label: string }> = [
  { src: "/images/comparisons/Crochet.png", label: "Crochet" },
  { src: "/images/comparisons/Cooking.png", label: "Cooking" },
  { src: "/images/comparisons/Car_Repair.png", label: "Car Repair" },
  { src: "/images/comparisons/Makeup.png", label: "Makeup" }
];

function resolveLandingHeroSource():
  | { kind: "iframe"; src: string }
  | { kind: "video"; src: string }
  | { kind: "legacy"; src: string } {
  const demoMp4 = process.env.NEXT_PUBLIC_LANDING_HERO_DEMO_MP4?.trim();
  if (demoMp4) {
    return { kind: "video", src: demoMp4 };
  }
  const explicitIframeUrl = env.landing.heroStreamIframeUrl()?.trim();
  if (explicitIframeUrl) {
    return { kind: "iframe", src: explicitIframeUrl };
  }
  const streamId = env.landing.heroStreamVideoId()?.trim();
  const customerSubdomain = env.cloudflareStream.customerSubdomain()?.trim();
  if (streamId && customerSubdomain) {
    return {
      kind: "iframe",
      src: `https://${customerSubdomain}/${encodeURIComponent(streamId)}/iframe?autoplay=true&muted=true&loop=true&controls=false`
    };
  }
  return { kind: "legacy", src: LEGACY_HERO_YOUTUBE_EMBED };
}

function renderLandingHeroMediaHtml(): string {
  const hero = resolveLandingHeroSource();
  if (hero.kind === "video") {
    return `<video src="${hero.src}" style="width:100%; aspect-ratio:16/9; border:none; border-radius:12px;" autoplay muted loop playsinline controls></video>`;
  }
  return `<iframe src="${hero.src}" style="width:100%; aspect-ratio:16/9; border:none; border-radius:12px;" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
}

function renderComparisonSectionHtml(): string {
  const cards = LANDING_COMPARISON_IMAGES.map(
    (item) => `
      <button
        type="button"
        class="comparison-card"
        data-comparison-trigger
        data-src="${item.src}"
        data-label="${item.label}"
        aria-label="Open ${item.label} comparison image"
      >
        <img src="${item.src}" alt="${item.label}" loading="lazy" />
        <span class="comparison-label">${item.label}</span>
      </button>
    `
  ).join("");

  return `
    <div class="section comparison-section" id="comparison">
      <div class="container">
        <h2 class="section-title">Works for any tutorial</h2>
        <div class="comparison-grid">
          ${cards}
        </div>
      </div>
    </div>
    <div class="comparison-modal" data-comparison-modal>
      <div class="comparison-modal-dialog">
        <button type="button" class="comparison-modal-close" data-comparison-modal-close aria-label="Close image preview">×</button>
        <img data-comparison-modal-img alt="" />
        <p class="comparison-modal-label" data-comparison-modal-label></p>
      </div>
    </div>
    <div class="divider"></div>
  `;
}

const getLandingMarkup = cache(() => {
  const raw = fs.readFileSync(path.join(process.cwd(), "src/app/landing-body.html"), "utf8");
  const heroHtml = renderLandingHeroMediaHtml();
  const withComparison = raw.includes(COMPARISON_SECTION_TOKEN)
    ? raw.replace(COMPARISON_SECTION_TOKEN, renderComparisonSectionHtml())
    : raw;
  if (withComparison.includes(HERO_MEDIA_TOKEN)) {
    return withComparison.replace(HERO_MEDIA_TOKEN, heroHtml);
  }
  const hero = resolveLandingHeroSource();
  if (withComparison.includes(LEGACY_HERO_YOUTUBE_EMBED)) {
    return withComparison.replace(LEGACY_HERO_YOUTUBE_EMBED, hero.src);
  }
  // Fallback for older HTML snapshots without HERO_MEDIA token.
  return withComparison.replace(
    /<div class="player-wrap">[\s\S]*?<div class="vid-area">[\s\S]*?<\/div>/,
    `<div class="player-wrap"><div class="vid-area">${heroHtml}</div>`
  );
});

export const metadata: Metadata = {
  title: "LinkSyllabus — Turn Your Tutorial Into a Step-by-Step Experience",
  description:
    "Paste a YouTube link or upload your own video. AI splits it into steps in seconds — distraction-free, scannable, and ready to print.",
  /** Pinterest checks the homepage URL — set here so merge with root layout cannot drop it. */
  other: {
    "p:domain_verify": "5e4b1cc9f935476bf76bac3225f0f9bb"
  }
};

export default function HomePage() {
  return (
    <>
      <div
        id="lp-root"
        dangerouslySetInnerHTML={{ __html: getLandingMarkup() }}
      />
      <LandingComparisonLightbox />
    </>
  );
}
