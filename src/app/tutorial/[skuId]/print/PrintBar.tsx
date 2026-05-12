"use client";

import html2canvas from "html2canvas";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { isAllowedPrintImageProxyUrl } from "@/lib/printImageProxy";

const SHARE_TEXT =
  "Step-by-step guide with QR codes · Free at linksyllabus.com";

/**
 * The "Download as long image" button captures the LongImageView render only.
 * The PDF path (window.print) still targets the existing PrintManualView.
 */
const PM_LONG_IMAGE_ROOT_ID = "pm-long-image-root";
const PNG_EXPORT_MAX_EDGE_PX = 14_000;

/** 1×1 transparent GIF — html2canvas cannot paint most cross-origin photos without tainting the canvas. */
const TRANSPARENT_PIXEL_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Prefetch images into blob: URLs and wait for decode, so html2canvas paints
 * from fully-loaded sources:
 *   - Cross-origin photos → fetched through `/api/print-image-proxy`.
 *   - Same-origin QR PNGs (`/api/qr/...`) → fetched directly. Same-origin
 *     images normally work, but pre-fetching guarantees the QR is fully
 *     decoded before html2canvas starts painting; otherwise a long-image
 *     export with many QRs can capture partially-loaded (blurry) PNGs.
 * Other same-origin images are left untouched.
 */
async function rewriteImagesForHtml2Canvas(root: HTMLElement): Promise<() => void> {
  const origin = window.location.origin;
  const blobUrls: string[] = [];
  const revert: { img: HTMLImageElement; src: string; srcset: string | null }[] = [];

  try {
    for (const node of Array.from(root.querySelectorAll("img"))) {
      const img = node as HTMLImageElement;
      const raw = (img.currentSrc || img.getAttribute("src") || "").trim();
      if (!raw || raw.startsWith("data:")) {
        continue;
      }

      let resolved: URL;
      try {
        resolved = new URL(raw, origin);
      } catch {
        continue;
      }
      const isSameOrigin = resolved.origin === origin;
      const isQrImage =
        isSameOrigin && resolved.pathname.startsWith("/api/qr/");

      if (isSameOrigin && !isQrImage) {
        continue;
      }

      revert.push({
        img,
        src: raw,
        srcset: img.getAttribute("srcset")
      });
      img.removeAttribute("srcset");

      if (isQrImage) {
        console.log("Long image QR URL:", resolved.href);
        try {
          const res = await fetch(resolved.href);
          if (!res.ok) {
            img.src = TRANSPARENT_PIXEL_GIF;
            continue;
          }
          const blob = await res.blob();
          const u = URL.createObjectURL(blob);
          blobUrls.push(u);
          img.src = u;
        } catch {
          img.src = TRANSPARENT_PIXEL_GIF;
        }
        continue;
      }

      if (isAllowedPrintImageProxyUrl(resolved)) {
        try {
          const res = await fetch(
            `${origin}/api/print-image-proxy?url=${encodeURIComponent(resolved.href)}`
          );
          if (!res.ok) {
            img.src = TRANSPARENT_PIXEL_GIF;
            continue;
          }
          const blob = await res.blob();
          const u = URL.createObjectURL(blob);
          blobUrls.push(u);
          img.src = u;
        } catch {
          img.src = TRANSPARENT_PIXEL_GIF;
        }
      } else {
        img.src = TRANSPARENT_PIXEL_GIF;
      }
    }

    await Promise.all(
      Array.from(root.querySelectorAll("img")).map((el) =>
        (el as HTMLImageElement).decode().catch(() => undefined)
      )
    );
  } catch (e) {
    for (const u of blobUrls) {
      URL.revokeObjectURL(u);
    }
    for (const { img, src, srcset } of revert) {
      img.src = src;
      if (srcset) {
        img.setAttribute("srcset", srcset);
      } else {
        img.removeAttribute("srcset");
      }
    }
    throw e;
  }

  return () => {
    for (const u of blobUrls) {
      URL.revokeObjectURL(u);
    }
    for (const { img, src, srcset } of revert) {
      img.src = src;
      if (srcset) {
        img.setAttribute("srcset", srcset);
      } else {
        img.removeAttribute("srcset");
      }
    }
  };
}

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
  const [pngOk, setPngOk] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pngErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pngOkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pngExportingRef = useRef(false);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (pngErrorTimerRef.current) clearTimeout(pngErrorTimerRef.current);
      if (pngOkTimerRef.current) clearTimeout(pngOkTimerRef.current);
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
    const root = document.getElementById(PM_LONG_IMAGE_ROOT_ID);
    if (!root) {
      setPngError("Guide not found on page.");
      return;
    }

    pngExportingRef.current = true;
    setPngBusy(true);
    setPngError(null);
    setPngOk(false);
    if (pngErrorTimerRef.current) {
      clearTimeout(pngErrorTimerRef.current);
      pngErrorTimerRef.current = null;
    }

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    window.scrollTo(0, 0);

    const pmRoot = document.getElementById("pm-root");
    if (!pmRoot) {
      setPngError("Layout not ready.");
      pngExportingRef.current = false;
      setPngBusy(false);
      window.scrollTo(scrollX, scrollY);
      return;
    }

    const clone = root.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.setAttribute("aria-hidden", "true");
    clone.style.cssText = [
      "position:fixed",
      "left:-99999px",
      "top:0",
      `width:${Math.max(1, Math.ceil(root.scrollWidth))}px`,
      "pointer-events:none",
      "z-index:2147483646",
      "margin:0"
    ].join(";");

    let restoreImages: (() => void) | undefined;
    try {
      pmRoot.appendChild(clone);
      restoreImages = await rewriteImagesForHtml2Canvas(clone);

      const w = clone.scrollWidth;
      const h = clone.scrollHeight;
      const scale = pickHtml2CanvasScale(w, h);
      const bg = getComputedStyle(pmRoot).backgroundColor;
      const canvas = await html2canvas(clone, {
        scale,
        useCORS: true,
        allowTaint: false,
        foreignObjectRendering: false,
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
      setPngOk(true);
      if (pngOkTimerRef.current) clearTimeout(pngOkTimerRef.current);
      pngOkTimerRef.current = setTimeout(() => {
        setPngOk(false);
        pngOkTimerRef.current = null;
      }, 3500);
    } catch (e) {
      setPngOk(false);
      const msg = e instanceof Error ? e.message : "Export failed.";
      setPngError(msg);
      pngErrorTimerRef.current = setTimeout(() => {
        setPngError(null);
        pngErrorTimerRef.current = null;
      }, 5000);
    } finally {
      restoreImages?.();
      clone.remove();
      window.scrollTo(scrollX, scrollY);
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
      {pngOk && !pngError ? (
        <span className="pm-png-ok" role="status">
          Saved — check your Downloads folder. 已保存，请查看下载文件夹。
        </span>
      ) : null}
    </div>
  );
}
