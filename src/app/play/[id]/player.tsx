"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Player from "@vimeo/player";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YtProps = {
  playbackId: string;
  videoId: string;
  startTime: number;
  endTime: number;
};

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();

  return new Promise((resolve) => {
    const existing = document.querySelector('script[data-yt-iframe="1"]');
    if (existing) {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.dataset.ytIframe = "1";
    window.onYouTubeIframeAPIReady = () => resolve();
    document.body.appendChild(tag);
  });
}

export function YouTubePlayerClient({ playbackId, videoId, startTime, endTime }: YtProps) {
  const containerId = useMemo(() => `yt-player-${playbackId}`, [playbackId]);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [endedOverlay, setEndedOverlay] = useState(false);

  useEffect(() => {
    fetch(`/api/step/${playbackId}/scan`, { method: "POST" }).catch(() => {});
  }, [playbackId]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      await loadYouTubeIframeApi();
      if (cancelled) return;

      playerRef.current = new window.YT.Player(containerId, {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: {
          // Equivalent to:
          // https://www.youtube.com/embed/{videoId}?start={startTime}&end={endTime}&autoplay=1&rel=0&modestbranding=1
          autoplay: 1,
          start: startTime,
          end: endTime,
          rel: 0,
          modestbranding: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1
        },
        events: {
          onReady: () => {
            setReady(true);
            try {
              // Ensure the segment starts exactly at `startTime`.
              playerRef.current?.seekTo?.(startTime, true);
            } catch {}
          },
          onStateChange: (event: any) => {
            try {
              const state = event?.data;
              const PLAYING = window.YT?.PlayerState?.PLAYING;
              const ENDED = window.YT?.PlayerState?.ENDED;
              const PAUSED = window.YT?.PlayerState?.PAUSED;

              if (state === PLAYING) {
                setStarted(true);
                setEndedOverlay(false);
                beginWatchdog();
                return;
              }

              if (state === ENDED) {
                setStarted(false);
                setEndedOverlay(true);
                if (intervalRef.current) window.clearInterval(intervalRef.current);
                intervalRef.current = null;
                return;
              }

              if (state === PAUSED) {
                // If we paused manually, hide end overlay.
                if (intervalRef.current) window.clearInterval(intervalRef.current);
                intervalRef.current = null;
                setStarted(false);
                return;
              }
            } catch {}
          }
        }
      });
    }

    init();

    return () => {
      cancelled = true;
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      try {
        playerRef.current?.destroy?.();
      } catch {}
    };
  }, [containerId, endTime, startTime, videoId]);

  function beginWatchdog() {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      try {
        const t = Number(playerRef.current?.getCurrentTime?.() ?? 0);
        // YT can be slightly late/early; treat `endTime` as inclusive.
        if (t >= endTime) {
          playerRef.current?.pauseVideo?.();
          window.clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setEndedOverlay(true);
          setStarted(false);
        }
      } catch {}
    }, 100);
  }

  function onPlay() {
    setEndedOverlay(false);
    setStarted(true);
    playerRef.current?.seekTo?.(startTime, true);
    playerRef.current?.playVideo?.();
  }

  function onPause() {
    playerRef.current?.pauseVideo?.();
  }

  function onReplay() {
    setEndedOverlay(false);
    playerRef.current?.seekTo?.(startTime, true);
    playerRef.current?.playVideo?.();
  }

  function onClose() {
    try {
      window.close();
    } catch {}

    setTimeout(() => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.reload();
    }, 50);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
        <div className="text-sm text-zinc-600">Playback (this step only)</div>
        <div className="flex gap-2">
          {!started ? (
            <button className="btn-primary" disabled={!ready} onClick={onPlay}>
              {ready ? "Play" : "Loading…"}
            </button>
          ) : (
            <>
              <button className="btn-ghost" onClick={onPause}>
                Pause
              </button>
              <button className="btn-primary" onClick={onReplay}>
                ▶ Replay
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative aspect-video bg-zinc-950">
        <div id={containerId} className="absolute inset-0" />

        {endedOverlay ? (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6">
            <div className="text-xl font-semibold">Back to your material</div>
            <button className="btn-primary w-full max-w-sm" onClick={onReplay}>
              ▶ Replay
            </button>
            <button className="btn-primary w-full max-w-sm" onClick={onClose}>
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type VmProps = {
  playbackId: string;
  vimeoId: string;
  startTime: number;
  endTime: number;
};

export function VimeoPlayerClient({ playbackId, vimeoId, startTime, endTime }: VmProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);

  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [endedOverlay, setEndedOverlay] = useState(false);

  useEffect(() => {
    fetch(`/api/step/${playbackId}/scan`, { method: "POST" }).catch(() => {});
  }, [playbackId]);

  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    const idNum = parseInt(vimeoId, 10);
    if (!el || Number.isNaN(idNum)) return;

    const player = new Player(el, {
      id: idNum,
      responsive: true,
      controls: false
    });
    playerRef.current = player;

    player
      .ready()
      .then(() => {
        if (cancelled) return;
        return player.setCurrentTime(startTime);
      })
      .then(() => {
        if (cancelled) return;
        return player.pause();
      })
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {});

    player.on("timeupdate", (data) => {
      if (data.seconds >= endTime) {
        player.pause().catch(() => {});
        setEndedOverlay(true);
      }
    });

    return () => {
      cancelled = true;
      player.destroy().catch(() => {});
    };
  }, [vimeoId, startTime, endTime]);

  async function onPlay() {
    const player = playerRef.current;
    if (!player) return;
    setEndedOverlay(false);
    setStarted(true);
    try {
      await player.setCurrentTime(startTime);
      await player.play();
    } catch {}
  }

  function onPause() {
    playerRef.current?.pause().catch(() => {});
  }

  async function onReplay() {
    const player = playerRef.current;
    if (!player) return;
    setEndedOverlay(false);
    try {
      await player.setCurrentTime(startTime);
      await player.play();
    } catch {}
  }

  function onClose() {
    try {
      window.close();
    } catch {}

    setTimeout(() => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.reload();
    }, 50);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
        <div className="text-sm text-zinc-600">Playback (this step only)</div>
        <div className="flex gap-2">
          {!started ? (
            <button className="btn-primary" disabled={!ready} onClick={onPlay}>
              {ready ? "Play" : "Loading…"}
            </button>
          ) : (
            <>
              <button className="btn-ghost" onClick={onPause}>
                Pause
              </button>
              <button className="btn-primary" onClick={onReplay}>
                Replay
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative aspect-video bg-zinc-950">
        <div ref={containerRef} className="absolute inset-0" />

        {endedOverlay ? (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6">
            <div className="text-xl font-semibold">Back to your material</div>
            <button className="btn-primary w-full max-w-sm" onClick={onClose}>
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** @deprecated Use YouTubePlayerClient */
export const PlayerClient = YouTubePlayerClient;
