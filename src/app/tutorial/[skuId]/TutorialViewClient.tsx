"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  useLinkVoiceControl,
  VoiceFeedbackBanners,
  VoiceMicCluster
} from "@/app/play/[id]/player";
import { formatStepNameForDisplay } from "@/lib/stepTitle";
import {
  buildYouTubeEmbedUrl,
  buildYouTubeWatchUrl
} from "@/lib/youtubeUrls";
import { detectVideoKind, extractYouTubeVideoId } from "@/lib/video";

export type TutorialStepPayload = {
  id: string;
  step_number: number;
  step_name: string;
  description: string;
  youtube_url: string;
  start_time: number;
  end_time: number;
};

type Props = {
  skuId: string;
  steps: TutorialStepPayload[];
  /** From `?step=N` (step_number). Selects that step; first load may autoplay the clip. */
  initialStepNumber?: number;
  materialsText?: string | null;
  toolsText?: string | null;
  /** Absolute path to printable manual (opens in new tab). */
  printHref: string;
};

const printQrGuideClassName =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2";

const SPEEDS = [0.5, 1, 1.5, 2] as const;

/** nocookie host + controls — improves Safari / Edge when third-party cookies block youtube.com */
const TUTORIAL_EMBED_BASE = {
  privacyEnhanced: true,
  controls: true as const
};

export function TutorialViewClient({
  skuId,
  steps,
  initialStepNumber,
  materialsText,
  toolsText,
  printHref
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoWrapRef = useRef<HTMLDivElement | null>(null);
  const timesRef = useRef({ start: 0, end: 0 });
  const autoplayFromUrlOnceRef = useRef(
    initialStepNumber != null &&
      steps.some((s) => s.step_number === initialStepNumber)
  );

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (initialStepNumber == null) return 0;
    const i = steps.findIndex((s) => s.step_number === initialStepNumber);
    return i >= 0 ? i : 0;
  });
  const materialsBody = (materialsText ?? "").trim();
  const toolsBody = (toolsText ?? "").trim();
  const hasMaterialsNav = materialsBody.length > 0 || toolsBody.length > 0;
  const [view, setView] = useState<"materials" | "step">("step");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [playbackRate, setPlaybackRate] = useState<(typeof SPEEDS)[number]>(1);

  const step = view === "step" ? steps[currentIndex] ?? steps[0] : undefined;
  const videoId = step ? extractYouTubeVideoId(step.youtube_url) : null;
  const kind = step ? detectVideoKind(step.youtube_url) : "unknown";
  const isYoutube =
    view === "step" && Boolean(videoId && kind === "youtube");

  useEffect(() => {
    if (currentIndex >= steps.length) {
      setCurrentIndex(Math.max(0, steps.length - 1));
    }
  }, [steps.length, currentIndex]);

  useEffect(() => {
    if (view !== "step" || !step?.id) return;
    fetch(`/api/step/${step.id}/scan`, { method: "POST" }).catch(() => {});
  }, [view, step?.id]);

  const startTime = step?.start_time ?? 0;
  const endTime = step?.end_time ?? 0;

  useEffect(() => {
    timesRef.current = { start: startTime, end: endTime };
  }, [startTime, endTime]);

  const embedSrc = useMemo(() => {
    if (!isYoutube || !videoId || !step) return "";
    if (endTime > startTime) {
      return buildYouTubeEmbedUrl(videoId, startTime, {
        ...TUTORIAL_EMBED_BASE,
        endSec: endTime
      });
    }
    /** No valid segment end in DB — still embed from `start` (avoids blank player). */
    return buildYouTubeEmbedUrl(videoId, startTime, { ...TUTORIAL_EMBED_BASE });
  }, [isYoutube, videoId, step?.id, startTime, endTime]);

  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  useEffect(() => {
    setPlaybackRate(1);
  }, [step?.id]);

  const postYtIframeCommand = useCallback(
    (func: string, args: unknown[]) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || !embedSrc) return;
      const origin = embedSrc.includes("youtube-nocookie.com")
        ? "https://www.youtube-nocookie.com"
        : "https://www.youtube.com";
      try {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: "command", func, args }),
          origin
        );
      } catch {
        /* ignore */
      }
    },
    [embedSrc]
  );

  const onSpeedClick = useCallback(
    (r: (typeof SPEEDS)[number]) => {
      setPlaybackRate(r);
      postYtIframeCommand("setPlaybackRate", [r]);
    },
    [postYtIframeCommand]
  );

  /** Optional autoplay when landing with ?step=N (browser may still require a gesture). */
  useEffect(() => {
    const el = iframeRef.current;
    if (!el || !videoId || !embedSrc) return;
    if (!autoplayFromUrlOnceRef.current) return;
    if (
      initialStepNumber == null ||
      step?.step_number !== initialStepNumber
    ) {
      return;
    }
    autoplayFromUrlOnceRef.current = false;
    el.src =
      endTime > startTime
        ? buildYouTubeEmbedUrl(videoId, startTime, {
            ...TUTORIAL_EMBED_BASE,
            endSec: endTime,
            autoplay: true
          })
        : buildYouTubeEmbedUrl(videoId, startTime, {
            ...TUTORIAL_EMBED_BASE,
            autoplay: true
          });
  }, [
    embedSrc,
    videoId,
    startTime,
    endTime,
    step?.step_number,
    initialStepNumber
  ]);

  const goPrev = useCallback(() => {
    if (view === "materials") return;
    if (currentIndex <= 0) {
      if (hasMaterialsNav) setView("materials");
      return;
    }
    setCurrentIndex((i) => i - 1);
  }, [view, currentIndex, hasMaterialsNav]);

  const goNext = useCallback(() => {
    if (view === "materials") {
      setView("step");
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((i) => Math.min(steps.length - 1, i + 1));
  }, [view, steps.length]);

  const jumpTo = useCallback((idx: number) => {
    setView("step");
    setCurrentIndex(Math.max(0, Math.min(steps.length - 1, idx)));
  }, [steps.length]);

  const jumpToMaterials = useCallback(() => {
    setView("materials");
  }, []);

  const replay = useCallback(() => {
    if (!videoId) return;
    const el = iframeRef.current;
    if (!el) return;
    const { start: rs, end: re } = timesRef.current;
    const src =
      re > rs
        ? buildYouTubeEmbedUrl(videoId, rs, {
            ...TUTORIAL_EMBED_BASE,
            endSec: re,
            autoplay: true
          })
        : buildYouTubeEmbedUrl(videoId, rs, {
            ...TUTORIAL_EMBED_BASE,
            autoplay: true
          });
    el.src = "";
    el.src = src;
    window.setTimeout(() => {
      postYtIframeCommand("setPlaybackRate", [playbackRateRef.current]);
    }, 900);
  }, [videoId, postYtIframeCommand]);

  const voiceNoop = useCallback(() => {}, []);

  const {
    voiceArmed,
    voiceAwake,
    voiceToast,
    toggleVoiceArm
  } = useLinkVoiceControl({
    onReplay: replay,
    onPause: voiceNoop,
    onPlay: voiceNoop,
    onNext: goNext,
    onPrevious: goPrev
  });

  const toggleFullscreen = useCallback(() => {
    const el = videoWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  }, []);

  const controlsBar = (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:py-2">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
        <button
          type="button"
          className="btn-ghost min-h-[44px] min-w-[44px] px-2 py-1.5 sm:min-h-0 sm:min-w-[2.5rem]"
          onClick={goPrev}
          disabled={view === "materials" || (currentIndex <= 0 && !hasMaterialsNav)}
          aria-label="Previous step"
        >
          ⏮
        </button>
        <button
          type="button"
          className="btn-ghost min-h-[44px] min-w-[44px] px-2 py-1.5 sm:min-h-0 sm:min-w-[2.5rem]"
          onClick={replay}
          aria-label="Replay this clip from the start"
        >
          ↺
        </button>
        <button
          type="button"
          className="btn-ghost min-h-[44px] min-w-[44px] px-2 py-1.5 sm:min-h-0 sm:min-w-[2.5rem]"
          onClick={goNext}
          disabled={view === "step" && currentIndex >= steps.length - 1}
          aria-label="Next step"
        >
          ⏭
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
        <span className="text-xs text-zinc-500">Speed</span>
        <div className="flex flex-wrap gap-1">
          {SPEEDS.map((r) => (
            <button
              key={r}
              type="button"
              className={`min-h-[40px] min-w-[2.75rem] rounded-md px-2 py-1.5 text-xs font-medium sm:min-h-0 sm:min-w-0 ${
                playbackRate === r
                  ? "bg-orange-500 text-white"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
              }`}
              onClick={() => onSpeedClick(r)}
            >
              {r}x
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-center sm:justify-start">
        <button
          type="button"
          className="btn-ghost min-h-[44px] min-w-[44px] px-2 py-1.5 sm:min-h-0 sm:min-w-0"
          onClick={toggleFullscreen}
          aria-label="Fullscreen"
        >
          ⛶
        </button>
      </div>
    </div>
  );

  const contentPanel =
    view === "materials" && hasMaterialsNav ? (
      <div className="space-y-6 lg:pl-2">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
            Prep
          </p>
          <h2 className="text-lg font-semibold text-zinc-900 md:text-xl">
            Materials &amp; Tools
          </h2>
        </div>
        {materialsBody ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
              Materials
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
              {materialsBody}
            </p>
          </div>
        ) : null}
        {toolsBody ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
              Tools
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
              {toolsBody}
            </p>
          </div>
        ) : null}
      </div>
    ) : step ? (
      <div className="space-y-3 lg:pl-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
          Step {step.step_number}
        </p>
        <h2 className="text-lg font-semibold text-zinc-900 md:text-xl">
          {formatStepNameForDisplay(step.step_name)}
        </h2>
        {step.description?.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
            {step.description}
          </p>
        ) : (
          <p className="text-sm text-zinc-400">No description for this step.</p>
        )}
      </div>
    ) : null;

  const materialsVideoPlaceholder =
    view === "materials" && hasMaterialsNav ? (
      <>
        <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-center text-sm text-zinc-600">
          <p className="font-medium text-zinc-800">Video clips are per step</p>
          <p className="text-xs text-zinc-500">
            Select a step in the list to play the matching segment.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 sm:justify-start">
          <button
            type="button"
            className="btn-ghost min-h-[44px] min-w-[44px] px-2 py-1.5 sm:min-h-0 sm:min-w-[2.5rem]"
            onClick={goPrev}
            disabled
            aria-label="Previous"
          >
            ⏮
          </button>
          <button
            type="button"
            className="btn-ghost min-h-[44px] min-w-[44px] px-2 py-1.5 sm:min-h-0 sm:min-w-[2.5rem]"
            onClick={goNext}
            aria-label="Next step"
          >
            ⏭
          </button>
        </div>
      </>
    ) : null;

  const videoBlock =
    materialsVideoPlaceholder ? (
      materialsVideoPlaceholder
    ) : !isYoutube ? (
      <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-950">
        <p>
          This step needs a YouTube URL for the tutorial view.{" "}
          {step ? (
            <Link
              className="font-medium text-orange-700 underline"
              href={`/play/${step.id}`}
            >
              Open the single-step player
            </Link>
          ) : null}
        </p>
      </div>
    ) : (
      <>
        <div
          ref={videoWrapRef}
          className="relative w-full min-h-0 min-w-0 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-black shadow-sm"
        >
          {embedSrc && videoId && step ? (
            <div className="relative h-0 w-full pb-[56.25%]">
              <iframe
                ref={iframeRef}
                key={`${skuId}-${step.id}-${videoId}-${startTime}-${endTime}`}
                src={embedSrc}
                width="100%"
                height="100%"
                className="absolute left-0 top-0 box-border block h-full w-full border-0"
                style={{ border: "none" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="YouTube video"
                frameBorder={0}
              />
              <a
                href={buildYouTubeWatchUrl(videoId, startTime)}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto absolute bottom-1.5 right-1.5 z-20 max-w-[min(100%,11rem)] text-right text-[11px] leading-snug text-zinc-500 no-underline hover:text-zinc-700 hover:underline"
              >
                Video blank? Open on YouTube
              </a>
            </div>
          ) : (
            <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 bg-zinc-950 px-4 py-12 text-center text-sm text-zinc-300">
              <p>Could not build a video URL for this step (missing YouTube link).</p>
            </div>
          )}
        </div>
        <div className="mt-3">{controlsBar}</div>
      </>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <VoiceMicCluster
          voiceArmed={voiceArmed}
          voiceAwake={voiceAwake}
          onToggle={toggleVoiceArm}
        />
        <p className="text-xs leading-snug text-zinc-500">
          Say <span className="font-semibold">Hey Link</span>, then replay, next,
          or previous.
        </p>
      </div>
      <VoiceFeedbackBanners
        voiceArmed={voiceArmed}
        voiceAwake={voiceAwake}
        voiceToast={voiceToast}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {!sidebarOpen ? (
          <button
            type="button"
            className="hidden shrink-0 self-start rounded-r-lg border border-l-0 border-zinc-200 bg-zinc-50 px-2 py-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 lg:block"
            onClick={() => setSidebarOpen(true)}
            aria-expanded={false}
          >
            Steps ▶
          </button>
        ) : null}

        <aside
          className={`hidden shrink-0 flex-col overflow-hidden bg-white shadow-sm transition-[width] lg:flex ${
            sidebarOpen
              ? "w-64 rounded-xl border border-zinc-200"
              : "w-0 border-0 p-0 opacity-0"
          }`}
          aria-hidden={!sidebarOpen}
        >
          {sidebarOpen ? (
            <>
              <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
                <span className="text-sm font-semibold text-zinc-800">Steps</span>
                <button
                  type="button"
                  className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Collapse step list"
                >
                  ◀
                </button>
              </div>
              <nav className="max-h-[min(70vh,32rem)] overflow-y-auto p-2">
                <ol className="space-y-1">
                  {hasMaterialsNav ? (
                    <li key="materials-tools">
                      <button
                        type="button"
                        onClick={jumpToMaterials}
                        className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                          view === "materials"
                            ? "bg-orange-500 font-medium text-white shadow-sm"
                            : "text-zinc-700 hover:bg-zinc-100"
                        }`}
                      >
                        <span
                          className={`shrink-0 tabular-nums ${
                            view === "materials" ? "text-white" : "text-zinc-400"
                          }`}
                        >
                          —
                        </span>
                        <span className="line-clamp-2">Materials &amp; Tools</span>
                      </button>
                    </li>
                  ) : null}
                  {steps.map((s, idx) => {
                    const active = view === "step" && idx === currentIndex;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => jumpTo(idx)}
                          className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                            active
                              ? "bg-orange-500 font-medium text-white shadow-sm"
                              : "text-zinc-700 hover:bg-zinc-100"
                          }`}
                        >
                          <span
                            className={`shrink-0 tabular-nums ${
                              active ? "text-white" : "text-zinc-400"
                            }`}
                          >
                            {s.step_number}.
                          </span>
                          <span className="line-clamp-2">
                            {formatStepNameForDisplay(s.step_name)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
          <nav className="mb-4 lg:hidden">
            <div className="rounded-xl border border-zinc-200 bg-white p-2">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Steps
              </p>
              <ol className="max-h-[min(40vh,16rem)] space-y-1 overflow-y-auto">
                {hasMaterialsNav ? (
                  <li key="materials-tools-m">
                    <button
                      type="button"
                      onClick={jumpToMaterials}
                      className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                        view === "materials"
                          ? "bg-orange-500 font-medium text-white shadow-sm"
                          : "text-zinc-700 hover:bg-zinc-100"
                      }`}
                    >
                      <span
                        className={`shrink-0 tabular-nums ${
                          view === "materials" ? "text-white" : "text-zinc-400"
                        }`}
                      >
                        —
                      </span>
                      <span className="line-clamp-2">Materials &amp; Tools</span>
                    </button>
                  </li>
                ) : null}
                {steps.map((s, idx) => {
                  const active = view === "step" && idx === currentIndex;
                  return (
                    <li key={`m-${s.id}`}>
                      <button
                        type="button"
                        onClick={() => jumpTo(idx)}
                        className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                          active
                            ? "bg-orange-500 font-medium text-white shadow-sm"
                            : "text-zinc-700 hover:bg-zinc-100"
                        }`}
                      >
                        <span
                          className={`shrink-0 tabular-nums ${
                            active ? "text-white" : "text-zinc-400"
                          }`}
                        >
                          {s.step_number}.
                        </span>
                        <span className="line-clamp-2">
                          {formatStepNameForDisplay(s.step_name)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </nav>
          <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
            <div className="min-h-0 min-w-0 w-full lg:w-[60%]">
              {videoBlock}
              <a
                href={printHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`${printQrGuideClassName} mt-4`}
              >
                🖨️ Print QR Guide
              </a>
            </div>
            <div className="w-full lg:w-[40%] lg:pt-0">{contentPanel}</div>
          </div>

        </div>
      </div>
    </div>
  );
}
