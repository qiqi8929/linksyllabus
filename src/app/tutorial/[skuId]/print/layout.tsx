import { DM_Sans, Playfair_Display } from "next/font/google";
import type { ReactNode } from "react";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-pm-playfair",
  display: "swap"
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-pm-dm",
  display: "swap"
});

export default function TutorialPrintLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${playfair.variable} ${dmSans.variable}`}>{children}</div>
  );
}
