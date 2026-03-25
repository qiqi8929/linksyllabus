import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LinkSyllabus",
  description: "Turn a YouTube segment into a scannable tutorial."
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

