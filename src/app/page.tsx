import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { cache } from "react";
import "./landing.css";

/** Avoid stale static HTML: landing copy is read at request time after deploy. */
export const dynamic = "force-dynamic";

const getLandingMarkup = cache(() =>
  fs.readFileSync(
    path.join(process.cwd(), "src/app/landing-body.html"),
    "utf8"
  )
);

const LANDING_HERO_VIDEO_PLACEHOLDER = "%LANDING_HERO_DEMO_VIDEO%";

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function getLandingHtml(): string {
  const videoSrc =
    process.env.NEXT_PUBLIC_LANDING_HERO_DEMO_MP4 || "/hero-demo.mp4";
  return getLandingMarkup().replaceAll(
    LANDING_HERO_VIDEO_PLACEHOLDER,
    escapeHtmlAttr(videoSrc)
  );
}

export const metadata: Metadata = {
  title: "LinkSyllabus — Turn Your Tutorial Into a Step-by-Step Experience",
  description:
    "Paste a YouTube link or upload your own video. AI splits it into steps in seconds — distraction-free, scannable, and ready to print."
};

export default function HomePage() {
  return (
    <div
      id="lp-root"
      dangerouslySetInnerHTML={{ __html: getLandingHtml() }}
    />
  );
}
