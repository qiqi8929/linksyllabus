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
  loadYouTubeIframeApi,
  useLinkVoiceControl,
  VoiceFeedbackBanners,
  VoiceMicCluster
} from "@/app/play/[id]/player";
import { detectVideoKind, extractYouTubeVideoId } from "@/lib/video";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type TutorialStepPayload = {
  id: string;
  step_number: number;
  step_name: string;
  description: string;
  youtube_url: string;
  start_time: number;
  end_time: number;
};

const SPEEDS = [0.5, 1, 1.5, 2] as const;

type Props = {
  skuId: string;
  steps: TutorialStepPayload[];
  /** From `?step=N` (step_number). Selects that step; first load may autoplay the clip. */
  initialStepNumber?: number;
};

export function TutorialViewClient({
  skuId,
  steps,
  initialStepNumber
}: Props) {
  const containerId = useMemo(() => `tutorial-yt-${skuId}`, [skuId]);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [playbackRate, setPlaybackRate] = useState<(typeof SPEEDS)[number]>(1);

  const step = steps[currentIndex] ?? steps[0];
  const videoId = step ? extractYouTubeVideoId(step.youtube_url) : null;
  const kind = step ? detectVideoKind(step.youtube_url) : "unknown";
  const isYoutube = Boolean(videoId && kind === "youtube");

  useEffect(() => {
    if (currentIndex >= steps.length) {
      setCurrentIndex(Math.max(0, steps.length - 1));
    }
  }, [steps.length, currentIndex]);

  useEffect(() => {
    if (!step?.id) return;
    fetch(`/api/step/${step.id}/scan`, { method: "POST" }).catch(() => {});
  }, [step?.id]);

  const startTime = step?.start_time ?? 0;
  const endTime = step?.end_time ?? 0;

  useEffect(() => {
    timesRef.current = { start: startTime, end: endTime };
  }, [startTime, endTime]);

  const clearWatchdog = useCallback(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(steps.length - 1, i + 1));
  }, [steps.length]);

  const jumpTo = useCallback((idx: number) => {
    setCurrentIndex(Math.max(0, Math.min(steps.length - 1, idx)));
  }, [steps.length]);

  const replay = useCallback(() => {
    const p = playerRef.current;
    if (!p?.seekTo) return;
    p.seekTo(timesRef.current.start, true);
    p.playVideo?.();
  }, []);

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo?.();
    else p.playVideo?.();
  }, [playing]);

  const {
    voiceArmed,
    voiceAwake,
    voiceToast,
    toggleVoiceArm
  } = useLinkVoiceControl({
    onReplay: replay,
    onPause: () => playerRef.current?.pauseVideo?.(),
    onPlay: () => playerRef.current?.playVideo?.(),
    onNext: goNext,
    onPrevious: goPrev
  });

  useEffect(() => {
    if (!isYoutube || !videoId || !step || endTime <= startTime) {
      clearWatchdog();
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy();
        } catch {
          /* ignore */
        }
        playerRef.current = null;
      }
      setPlaying(false);
      return;
    }

    let cancelled = false;

    (async () => {
      await loadYouTubeIframeApi();
      if (cancelled) return;

      if (!document.getElementById(containerId)) return;

      const player = new window.YT.Player(containerId, {
        videoId,
        playerVars: {
          autoplay: 0,
          start: Math.floor(startTime),
          rel: 0,
          modestbranding: 1,
          controls: 0,
          fs: 0,
          playsinline: 1,
          disablekb: 1,
          /** Fewer on-screen overlays; does not remove channel/title per YouTube policy. */
          iv_load_policy: 3
        },
        events: {
          onReady: (e: { target: any }) => {
            e.target.seekTo(startTime, true);
            e.target.setVolume(volume);
            e.target.setPlaybackRate(playbackRate);
            if (autoplayFromUrlOnceRef.current) {
              autoplayFromUrlOnceRef.current = false;
              e.target.playVideo();
            }
          },
          onStateChange: (e: { data: number }) => {
            const YT = window.YT;
            if (!YT?.PlayerState) return;
            if (e.data === YT.PlayerState.PLAYING) setPlaying(true);
            else if (
              e.data === YT.PlayerState.PAUSED ||
              e.data === YT.PlayerState.ENDED
            ) {
              setPlaying(false);
            }
          }
        }
      });

      if (cancelled) {
        try {
          player.destroy();
        } catch {
          /* ignore */
        }
        return;
      }

      playerRef.current = player;

      intervalRef.current = window.setInterval(() => {
        try {
          const t = player.getCurrentTime();
          if (t >= endTime - 0.12) {
            player.pauseVideo();
            setPlaying(false);
          }
        } catch {
          /* ignore */
        }
      }, 200);
    })();

    return () => {
      cancelled = true;
      clearWatchdog();
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      setPlaying(false);
    };
  }, [
    isYoutube,
    videoId,
    step?.id,
    startTime,
    endTime,
    containerId,
    clearWatchdog
  ]);

  useEffect(() => {
    playerRef.current?.setVolume?.(volume);
  }, [volume]);

  useEffect(() => {
    playerRef.current?.setPlaybackRate?.(playbackRate);
  }, [playbackRate]);

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
          disabled={currentIndex <= 0}
          aria-label="Previous step"
        >
          ⏮
        </button>
        <button
          type="button"
          className="btn-ghost min-h-[44px] min-w-[44px] px-2 py-1.5 sm:min-h-0 sm:min-w-[2.5rem]"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          className="btn-ghost min-h-[44px] min-w-[44px] px-2 py-1.5 sm:min-h-0 sm:min-w-[2.5rem]"
          onClick={goNext}
          disabled={currentIndex >= steps.length - 1}
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
              onClick={() => setPlaybackRate(r)}
            >
              {r}x
            </button>
          ))}
        </div>
      </div>
      <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 sm:min-w-[140px]">
        <span className="text-xs" aria-hidden>
          🔊
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-2 flex-1 accent-orange-500"
          aria-label="Volume"
        />
      </label>
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

  const stepPanel = step ? (
    <div className="space-y-3 lg:pl-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
        Step {step.step_number}
      </p>
      <h2 className="text-lg font-semibold text-zinc-900 md:text-xl">
        {step.step_name}
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

  const videoBlock = !isYoutube ? (
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
        className="overflow-hidden rounded-xl border border-zinc-200 bg-black shadow-sm"
      >
        <div id={containerId} className="aspect-video w-full" />
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
          Say <span className="font-semibold">Hey Link</span>, then replay, pause,
          play, next, or previous.
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
                  {steps.map((s, idx) => {
                    const active = idx === currentIndex;
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
                          <span className="line-clamp-2">{s.step_name}</span>
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
          <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
            <div className="w-full lg:w-[60%]">
              {videoBlock}
            </div>
            <div className="w-full lg:w-[40%] lg:pt-0">{stepPanel}</div>
          </div>

        </div>
      </div>
    </div>
  );
}
