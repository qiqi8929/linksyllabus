import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { cache } from "react";
import { env } from "@/lib/env";
import "./landing.css";

/** Avoid stale static HTML: landing copy is read at request time after deploy. */
export const dynamic = "force-dynamic";

const LEGACY_HERO_YOUTUBE_EMBED =
  "https://www.youtube.com/embed/q9WEi19Py9o?autoplay=1&mute=1&loop=1&playlist=q9WEi19Py9o&controls=0&modestbranding=1&playsinline=1";

function resolveLandingHeroEmbedUrl(): string {
  const streamId = env.landing.heroStreamVideoId()?.trim();
  const customerSubdomain = env.cloudflareStream.customerSubdomain()?.trim();
  if (streamId && customerSubdomain) {
    return `https://${customerSubdomain}/${encodeURIComponent(streamId)}/iframe?autoplay=true&muted=true&loop=true&controls=false`;
  }
  return LEGACY_HERO_YOUTUBE_EMBED;
}

const getLandingMarkup = cache(() => {
  const raw = fs.readFileSync(path.join(process.cwd(), "src/app/landing-body.html"), "utf8");
  return raw.replace(LEGACY_HERO_YOUTUBE_EMBED, resolveLandingHeroEmbedUrl());
});

export const metadata: Metadata = {
  title: "LinkSyllabus — Turn Your Tutorial Into a Step-by-Step Experience",
  description:
    "Paste a YouTube link or upload your own video. AI splits it into steps in seconds — distraction-free, scannable, and ready to print."
};

export default function HomePage() {
  return (
    <div
      id="lp-root"
      dangerouslySetInnerHTML={{ __html: getLandingMarkup() }}
    />
  );
}
