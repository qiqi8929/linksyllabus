import "./globals.css";
import type { Metadata } from "next";

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
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}

