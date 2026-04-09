import "./globals.css";
import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap"
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap"
});

export const metadata: Metadata = {
  title: {
    default: "LinkSyllabus",
    template: "%s · LinkSyllabus"
  },
  description:
    "Turn a long tutorial video into guided steps with QR codes, print sheets, and voice control."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable}`}
    >
      <body className={`${dmSans.className} min-h-screen antialiased`}>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}

