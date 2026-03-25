"use client";

import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Props = {
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

export function PlayerClient({ playbackId, videoId, startTime, endTime }: Props) {
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
          autoplay: 0,
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
              playerRef.current?.seekTo(startTime, true);
              playerRef.current?.pauseVideo();
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
        if (t >= endTime) {
          playerRef.current?.pauseVideo?.();
          window.clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setEndedOverlay(true);
        }
      } catch {}
    }, 100);
  }

  function onPlay() {
    setEndedOverlay(false);
    setStarted(true);
    playerRef.current?.seekTo?.(startTime, true);
    playerRef.current?.playVideo?.();
    beginWatchdog();
  }

  function onPause() {
    playerRef.current?.pauseVideo?.();
  }

  function onReplay() {
    setEndedOverlay(false);
    playerRef.current?.seekTo?.(startTime, true);
    playerRef.current?.playVideo?.();
    beginWatchdog();
  }

  function onClose() {
    // Prefer closing the tab if the browser allows it; otherwise go back.
    try {
      window.close();
    } catch {}

    setTimeout(() => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      // Fallback: reload the current page to remove the overlay.
      window.location.reload();
    }, 50);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
        <div className="text-sm text-zinc-600">播放控制（只播本步片段）</div>
        <div className="flex gap-2">
          {!started ? (
            <button className="btn-primary" disabled={!ready} onClick={onPlay}>
              {ready ? "播放" : "加载中..."}
            </button>
          ) : (
            <>
              <button className="btn-ghost" onClick={onPause}>
                暂停
              </button>
              <button className="btn-primary" onClick={onReplay}>
                重播
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative aspect-video bg-zinc-950">
        <div id={containerId} className="absolute inset-0" />

        {endedOverlay ? (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6">
            <div className="text-xl font-semibold">回到教材</div>
            <button className="btn-primary w-full max-w-sm" onClick={onClose}>
              关闭
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
