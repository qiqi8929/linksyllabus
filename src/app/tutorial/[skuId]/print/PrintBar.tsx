"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const SHARE_TEXT =
  "Step-by-step guide with QR codes · Free at linksyllabus.com";

const PM_MANUAL_ROOT_ID = "pm-manual-root";
const PNG_EXPORT_MAX_EDGE_PX = 14_000;

function pickHtml2CanvasScale(width: number, height: number): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  let scale = Math.min(2, Math.max(1, dpr));
  while (width * scale > PNG_EXPORT_MAX_EDGE_PX || height * scale > PNG_EXPORT_MAX_EDGE_PX) {
    scale *= 0.72;
    if (scale < 0.45) {
      return 0.45;
    }
  }
  return Math.round(scale * 100) / 100;
}

export function PrintBar({
  tutorialHref,
  tutorialTitle,
  pngDownloadBasename
}: {
  tutorialHref: string;
  tutorialTitle: string;
  /** Safe filename stem (no extension) for the long PNG download */
  pngDownloadBasename: string;
}) {
  const [copied, setCopied] = useState(false);
  const [pngBusy, setPngBusy] = useState(false);
  const [pngError, setPngError] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pngErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pngExportingRef = useRef(false);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (pngErrorTimerRef.current) clearTimeout(pngErrorTimerRef.current);
    },
    []
  );

  const handleShare = useCallback(async () => {
    const url = window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: tutorialTitle,
          text: SHARE_TEXT,
          url
        });
        return;
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name === "AbortError") return;
        /* fall through — copy link */
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2500);
    } catch {
      /* ignore */
    }
  }, [tutorialTitle]);

  const handleDownloadLongPng = useCallback(async () => {
    if (pngExportingRef.current) return;
    const root = document.getElementById(PM_MANUAL_ROOT_ID);
    if (!root) {
      setPngError("Guide not found on page.");
      return;
    }

    pngExportingRef.current = true;
    setPngBusy(true);
    setPngError(null);
    if (pngErrorTimerRef.current) {
      clearTimeout(pngErrorTimerRef.current);
      pngErrorTimerRef.current = null;
    }

    try {
      const { default: html2canvas } = await import("html2canvas");
      const w = root.scrollWidth;
      const h = root.scrollHeight;
      const scale = pickHtml2CanvasScale(w, h);
      const pmRoot = document.getElementById("pm-root");
      const bg =
        pmRoot != null ? getComputedStyle(pmRoot).backgroundColor : "rgb(245, 242, 238)";
      const canvas = await html2canvas(root, {
        scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: bg || "#f5f2ee"
      });

      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Could not build image."));
              return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${pngDownloadBasename}-guide.png`;
            a.rel = "noopener";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            resolve();
          },
          "image/png"
        );
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed.";
      setPngError(msg);
      pngErrorTimerRef.current = setTimeout(() => {
        setPngError(null);
        pngErrorTimerRef.current = null;
      }, 5000);
    } finally {
      pngExportingRef.current = false;
      setPngBusy(false);
    }
  }, [pngDownloadBasename]);

  return (
    <div className="pm-print-bar print:hidden">
      <Link className="pm-back-btn" href={tutorialHref}>
        ← Back to tutorial
      </Link>
      <button type="button" className="pm-share-btn" onClick={handleShare}>
        {copied ? "Link copied!" : "Share"}
      </button>
      <button
        type="button"
        className="pm-png-btn"
        disabled={pngBusy}
        onClick={handleDownloadLongPng}
      >
        {pngBusy ? "Building image…" : "Download as long image"}
      </button>
      <button type="button" className="pm-print-btn" onClick={() => window.print()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <polyline
            points="6 9 6 2 18 2 18 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="6" y="14" width="12" height="8" stroke="currentColor" strokeWidth="2" />
        </svg>
        Print / Save PDF
      </button>
      {pngError ? (
        <span className="pm-png-error" role="status">
          {pngError}
        </span>
      ) : null}
    </div>
  );
}
