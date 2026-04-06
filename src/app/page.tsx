import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { cache } from "react";
import "./landing.css";

const getLandingMarkup = cache(() =>
  fs.readFileSync(
    path.join(process.cwd(), "src/app/landing-body.html"),
    "utf8"
  )
);

export const metadata: Metadata = {
  title: "LinkSyllabus — Turn Your Tutorial Into a Step-by-Step Experience",
  description:
    "Cut your long tutorial video into guided steps. Print a QR-code instruction sheet. Buyers scan any step, jump straight to that clip — voice controlled, ad-free, at their own pace."
};

export default function HomePage() {
  return (
    <div
      id="lp-root"
      dangerouslySetInnerHTML={{ __html: getLandingMarkup() }}
    />
  );
}
