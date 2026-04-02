"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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
  skuId: string;
  stepNumber: number;
};

type VoiceToastType = { kind: "replay" | "pause" | "play" | "next"; text: string };

function parseVoiceCommand(t: string): "replay" | "pause" | "play" | "next" | null {
  const s = t.toLowerCase();
  if (/(replay|again)/.test(s)) return "replay";
  if (/(pause|stop)/.test(s)) return "pause";
  if (/(play|resume)/.test(s)) return "play";
  if (/(next)/.test(s)) return "next";
  return null;
}

function useVoiceCommands(opts: {
  onReplay: () => void;
  onPause: () => void;
  onPlay: () => void;
  onNext: () => void | Promise<void>;
}) {
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceToast, setVoiceToast] = useState<VoiceToastType | null>(null);

  const recognitionRef = useRef<any>(null);
  const voiceEnabledRef = useRef(false);
  const lastCommandAtRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((t: VoiceToastType) => {
    setVoiceToast(t);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setVoiceToast(null), 2400);
  }, []);

  const stopListening = useCallback(() => {
    voiceEnabledRef.current = false;
    setVoiceListening(false);
    try {
      recognitionRef.current?.stop?.();
    } catch {}
  }, []);

  const startListening = useCallback(() => {
    if (voiceEnabledRef.current) return;

    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      showToast({ kind: "next", text: "🎤 Voice control not supported in this browser." });
      return;
    }

    voiceEnabledRef.current = true;
    setVoiceListening(true);

    const recognition = new SR();
    recognitionRef.current = recognition;

    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      try {
        // Collect all new final results.
        const parts: string[] = [];
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r?.isFinal) parts.push(r?.[0]?.transcript ?? "");
        }
        const transcript = parts.join(" ").trim();
        if (!transcript) return;

        const cmd = parseVoiceCommand(transcript);
        if (!cmd) return;

        const now = Date.now();
        if (now - lastCommandAtRef.current < 800) return;
        lastCommandAtRef.current = now;

        if (cmd === "replay") {
          showToast({ kind: "replay", text: "🎤 Replaying..." });
          opts.onReplay();
          return;
        }
        if (cmd === "pause") {
          showToast({ kind: "pause", text: "🎤 Pausing..." });
          opts.onPause();
          return;
        }
        if (cmd === "play") {
          showToast({ kind: "play", text: "🎤 Playing..." });
          opts.onPlay();
          return;
        }
        if (cmd === "next") {
          showToast({ kind: "next", text: "🎤 Next step..." });
          Promise.resolve(opts.onNext()).catch(() => {
            showToast({ kind: "next", text: "🎤 Could not load next step." });
          });
          return;
        }
      } catch {}
    };

    recognition.onerror = (event: any) => {
      // Keep it visible but don't spam.
      const msg = event?.error ? String(event.error) : "Speech recognition error";
      console.error("[voice] recognition error", msg);
      showToast({ kind: "next", text: "🎤 Voice error. Try again." });
    };

    recognition.onend = () => {
      if (!voiceEnabledRef.current) return;
      // SpeechRecognition may stop automatically; restart to keep listening.
      try {
        recognition.start();
      } catch {}
    };

    try {
      recognition.start();
    } catch {}
  }, [opts, showToast]);

  useEffect(() => {
    return () => {
      try {
        voiceEnabledRef.current = false;
        recognitionRef.current?.stop?.();
      } catch {}
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  return { voiceListening, voiceToast, startListening, stopListening, setVoiceToast: showToast };
}

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

export function YouTubePlayerClient({ playbackId, videoId, startTime, endTime, skuId, stepNumber }: YtProps) {
  const containerId = useMemo(() => `yt-player-${playbackId}`, [playbackId]);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);

  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [endedOverlay, setEndedOverlay] = useState(false);

  const goToNextStep = useCallback(async () => {
    if (!skuId) return;
    const nextStepNumber = stepNumber + 1;
    const supabase = createSupabaseBrowserClient();

    const { data, error } = await supabase
      .from("steps")
      .select("id")
      .eq("sku_id", skuId)
      .eq("step_number", nextStepNumber)
      .maybeSingle();

    if (error || !data?.id) {
      return;
    }

    router.push(`/play/${data.id}`);
  }, [router, skuId, stepNumber]);

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

  function onResume() {
    setEndedOverlay(false);
    setStarted(true);
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

  const { voiceListening, voiceToast, startListening, stopListening, setVoiceToast } =
    useVoiceCommands({
      onReplay: () => onReplay(),
      onPause: () => onPause(),
      onPlay: () => {
        // Voice "play"/"resume": if we already ended, replay the segment.
        if (endedOverlay) onReplay();
        else onResume();
      },
      onNext: async () => {
        try {
          await goToNextStep();
        } catch {
          setVoiceToast({ kind: "next", text: "🎤 Could not load next step." });
        }
      }
    });

  const toggleVoice = useCallback(() => {
    if (voiceListening) stopListening();
    else startListening();
  }, [voiceListening, startListening, stopListening]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
        <div className="text-sm text-zinc-600">Playback (this step only)</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              voiceListening ? "bg-emerald-500" : "bg-zinc-400"
            }`}
            aria-label={voiceListening ? "Voice listening on" : "Voice listening off"}
          />
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={toggleVoice}
            aria-pressed={voiceListening}
          >
            🎤 Voice Control
          </button>
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

      {voiceToast ? (
        <div className="px-4 py-3 text-sm text-zinc-800">{voiceToast.text}</div>
      ) : null}

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
  skuId: string;
  stepNumber: number;
};

export function VimeoPlayerClient({
  playbackId,
  vimeoId,
  startTime,
  endTime,
  skuId,
  stepNumber
}: VmProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);

  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [endedOverlay, setEndedOverlay] = useState(false);

  const goToNextStep = useCallback(async () => {
    if (!skuId) return;
    const nextStepNumber = stepNumber + 1;
    const supabase = createSupabaseBrowserClient();

    const { data, error } = await supabase
      .from("steps")
      .select("id")
      .eq("sku_id", skuId)
      .eq("step_number", nextStepNumber)
      .maybeSingle();

    if (error || !data?.id) return;
    router.push(`/play/${data.id}`);
  }, [router, skuId, stepNumber]);

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
    setStarted(false);
  }

  function onResume() {
    const player = playerRef.current;
    if (!player) return;
    setEndedOverlay(false);
    setStarted(true);
    player.play().catch(() => {});
  }

  async function onReplay() {
    const player = playerRef.current;
    if (!player) return;
    setEndedOverlay(false);
    setStarted(true);
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

  const { voiceListening, voiceToast, startListening, stopListening, setVoiceToast } =
    useVoiceCommands({
      onReplay: () => onReplay(),
      onPause: () => onPause(),
      onPlay: () => {
        // Voice "play"/"resume"
        if (endedOverlay) onReplay();
        else onResume();
      },
      onNext: async () => {
        try {
          await goToNextStep();
        } catch {
          setVoiceToast({ kind: "next", text: "🎤 Could not load next step." });
        }
      }
    });

  const toggleVoice = useCallback(() => {
    if (voiceListening) stopListening();
    else startListening();
  }, [voiceListening, startListening, stopListening]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
        <div className="text-sm text-zinc-600">Playback (this step only)</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              voiceListening ? "bg-emerald-500" : "bg-zinc-400"
            }`}
            aria-label={voiceListening ? "Voice listening on" : "Voice listening off"}
          />
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={toggleVoice}
            aria-pressed={voiceListening}
          >
            🎤 Voice Control
          </button>
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

      {voiceToast ? (
        <div className="px-4 py-3 text-sm text-zinc-800">{voiceToast.text}</div>
      ) : null}

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
