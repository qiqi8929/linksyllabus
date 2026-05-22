import "./globals.css";
import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import Script from "next/script";

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
    "Magic Log — log Alberta apprentice hours and competences by voice, photo, or quick entry, with mentor sign-off and AIT exports."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable}`}
    >
      <body className={`${dmSans.className} min-h-screen antialiased`}>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-8THXFQ4PWF"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-8THXFQ4PWF');
          `}
        </Script>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}

