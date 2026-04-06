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

type VoiceCmd = "replay" | "pause" | "play" | "next" | "previous";

const WAKE_RE = /hey\s+link/i;

function stripWakePhrase(t: string) {
  return t.replace(WAKE_RE, " ").replace(/\s+/g, " ").trim();
}

function parseVoiceCommand(t: string): VoiceCmd | null {
  const s = t.toLowerCase();
  if (/\b(replay|again)\b/.test(s)) return "replay";
  if (/\b(pause|stop)\b/.test(s)) return "pause";
  if (/\b(play|resume|continue)\b/.test(s)) return "play";
  if (/\bnext\b/.test(s)) return "next";
  if (/\b(back|previous)\b/.test(s)) return "previous";
  return null;
}

function playWakeBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.13);
  } catch {
    // ignore
  }
}

export function useLinkVoiceControl(opts: {
  onReplay: () => void;
  onPause: () => void;
  onPlay: () => void;
  onNext: () => void | Promise<void>;
  onPrevious: () => void | Promise<void>;
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [voiceArmed, setVoiceArmed] = useState(false);
  const [voiceAwake, setVoiceAwake] = useState(false);
  const [voiceToast, setVoiceToast] = useState<string | null>(null);

  const armedRef = useRef(false);
  const awakeRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const commandWindowTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const lastFireRef = useRef(0);

  const showToast = useCallback((text: string) => {
    setVoiceToast(text);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setVoiceToast(null), 2200);
  }, []);

  const clearCommandWindow = useCallback(() => {
    if (commandWindowTimerRef.current) {
      window.clearTimeout(commandWindowTimerRef.current);
      commandWindowTimerRef.current = null;
    }
    awakeRef.current = false;
    setVoiceAwake(false);
  }, []);

  const startCommandWindow = useCallback(() => {
    playWakeBeep();
    awakeRef.current = true;
    setVoiceAwake(true);
    if (commandWindowTimerRef.current) window.clearTimeout(commandWindowTimerRef.current);
    commandWindowTimerRef.current = window.setTimeout(() => {
      commandWindowTimerRef.current = null;
      awakeRef.current = false;
      setVoiceAwake(false);
    }, 5000);
  }, []);

  const runCommand = useCallback(
    (cmd: VoiceCmd) => {
      const now = Date.now();
      if (now - lastFireRef.current < 500) return;
      lastFireRef.current = now;

      clearCommandWindow();

      const o = optsRef.current;
      if (cmd === "replay") {
        showToast("✓ Replay");
        o.onReplay();
        return;
      }
      if (cmd === "pause") {
        showToast("✓ Pause");
        o.onPause();
        return;
      }
      if (cmd === "play") {
        showToast("✓ Play");
        o.onPlay();
        return;
      }
      if (cmd === "next") {
        showToast("✓ Next");
        Promise.resolve(o.onNext()).catch(() => {
          showToast("✗ Next step unavailable");
        });
        return;
      }
      if (cmd === "previous") {
        showToast("✓ Previous");
        Promise.resolve(o.onPrevious()).catch(() => {
          showToast("✗ Previous step unavailable");
        });
      }
    },
    [clearCommandWindow, showToast]
  );

  const stopRecognition = useCallback(() => {
    armedRef.current = false;
    setVoiceArmed(false);
    clearCommandWindow();
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // ignore
    }
  }, [clearCommandWindow]);

  const tryStartRecognition = useCallback(() => {
    if (!armedRef.current) return;
    try {
      recognitionRef.current?.start?.();
    } catch {
      // often "already started" — ignore
    }
  }, []);

  const attachRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      showToast("Voice not supported in this browser.");
      armedRef.current = false;
      setVoiceArmed(false);
      return;
    }

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      try {
        const parts: string[] = [];
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r?.isFinal) parts.push(String(r?.[0]?.transcript ?? ""));
        }
        const raw = parts.join(" ").trim();
        if (!raw) return;

        if (!armedRef.current) return;

        const hasWake = WAKE_RE.test(raw);

        if (awakeRef.current) {
          const cmd = parseVoiceCommand(raw);
          if (cmd) {
            runCommand(cmd);
            return;
          }
          if (hasWake) {
            startCommandWindow();
          }
          return;
        }

        if (hasWake) {
          startCommandWindow();
          const rest = stripWakePhrase(raw);
          if (rest) {
            const cmd = parseVoiceCommand(rest);
            if (cmd) runCommand(cmd);
          }
        }
      } catch {
        // ignore
      }
    };

    recognition.onerror = (event: any) => {
      const code = event?.error ? String(event.error) : "unknown";
      if (code === "aborted") return;
      if (code === "not-allowed") {
        console.warn("[voice] microphone not allowed");
        showToast("Microphone access denied.");
        stopRecognition();
        return;
      }
      if (code === "no-speech") return;

      console.warn("[voice] recognition error", code);
      if (!armedRef.current) return;
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        tryStartRecognition();
      }, 350);
    };

    recognition.onend = () => {
      if (!armedRef.current) return;
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        tryStartRecognition();
      }, 120);
    };

    tryStartRecognition();
  }, [runCommand, showToast, startCommandWindow, stopRecognition, tryStartRecognition]);

  const startVoiceArm = useCallback(() => {
    if (armedRef.current) return;
    armedRef.current = true;
    setVoiceArmed(true);
    attachRecognition();
  }, [attachRecognition]);

  const toggleVoiceArm = useCallback(() => {
    if (armedRef.current) stopRecognition();
    else startVoiceArm();
  }, [startVoiceArm, stopRecognition]);

  useEffect(() => {
    return () => {
      armedRef.current = false;
      if (commandWindowTimerRef.current) window.clearTimeout(commandWindowTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      try {
        recognitionRef.current?.stop?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    voiceArmed,
    voiceAwake,
    voiceToast,
    toggleVoiceArm,
    showToast,
    stopVoice: stopRecognition
  };
}

export function VoiceMicCluster({
  voiceArmed,
  voiceAwake,
  onToggle
}: {
  voiceArmed: boolean;
  voiceAwake: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <span
        className="flex items-center gap-1"
        title={
          !voiceArmed ? "Voice off" : voiceAwake ? "Listening for commands" : 'Say "Hey Link"'
        }
      >
        <span
          className={`text-lg leading-none ${
            !voiceArmed
              ? "grayscale opacity-50"
              : voiceAwake
                ? "animate-pulse text-emerald-600"
                : "text-zinc-500"
          }`}
        >
          🎤
        </span>
        <span
          className={`h-2 w-2 rounded-full ${
            !voiceArmed ? "bg-zinc-300" : voiceAwake ? "animate-pulse bg-emerald-500" : "bg-zinc-400"
          }`}
        />
      </span>
      <button type="button" className="btn-ghost text-sm" onClick={onToggle} aria-pressed={voiceArmed}>
        🎤 Voice Control
      </button>
    </>
  );
}

export function VoiceFeedbackBanners({
  voiceArmed,
  voiceAwake,
  voiceToast
}: {
  voiceArmed: boolean;
  voiceAwake: boolean;
  voiceToast: string | null;
}) {
  return (
    <>
      {voiceAwake ? (
        <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          Listening… Say a command (replay, pause, play, next, back).
        </div>
      ) : voiceArmed ? (
        <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-xs text-zinc-600">
          Say <span className="font-semibold">Hey Link</span> to wake voice commands.
        </div>
      ) : null}
      {voiceToast ? (
        <div className="border-b border-zinc-100 bg-white px-4 py-2 text-sm font-medium text-zinc-900">
          {voiceToast}
        </div>
      ) : null}
    </>
  );
}

export function loadYouTubeIframeApi(): Promise<void> {
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
    if (!skuId) throw new Error("missing sku");
    const nextStepNumber = stepNumber + 1;
    const supabase = createSupabaseBrowserClient();

    const { data, error } = await supabase
      .from("steps")
      .select("id")
      .eq("sku_id", skuId)
      .eq("step_number", nextStepNumber)
      .maybeSingle();

    if (error || !data?.id) throw new Error("next not found");

    router.push(`/play/${data.id}`);
  }, [router, skuId, stepNumber]);

  const goToPreviousStep = useCallback(async () => {
    if (!skuId) throw new Error("missing sku");
    if (stepNumber <= 1) throw new Error("no previous");
    const prevNum = stepNumber - 1;
    const supabase = createSupabaseBrowserClient();

    const { data, error } = await supabase
      .from("steps")
      .select("id")
      .eq("sku_id", skuId)
      .eq("step_number", prevNum)
      .maybeSingle();

    if (error || !data?.id) throw new Error("previous not found");

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

  const { voiceArmed, voiceAwake, voiceToast, toggleVoiceArm } = useLinkVoiceControl({
    onReplay: () => onReplay(),
    onPause: () => onPause(),
    onPlay: () => {
      if (endedOverlay) onReplay();
      else onResume();
    },
    onNext: () => goToNextStep(),
    onPrevious: () => goToPreviousStep()
  });

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
        <div className="text-sm text-zinc-600">Playback (this step only)</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <VoiceMicCluster
            voiceArmed={voiceArmed}
            voiceAwake={voiceAwake}
            onToggle={toggleVoiceArm}
          />
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

      <VoiceFeedbackBanners voiceArmed={voiceArmed} voiceAwake={voiceAwake} voiceToast={voiceToast} />

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
    if (!skuId) throw new Error("missing sku");
    const nextStepNumber = stepNumber + 1;
    const supabase = createSupabaseBrowserClient();

    const { data, error } = await supabase
      .from("steps")
      .select("id")
      .eq("sku_id", skuId)
      .eq("step_number", nextStepNumber)
      .maybeSingle();

    if (error || !data?.id) throw new Error("next not found");
    router.push(`/play/${data.id}`);
  }, [router, skuId, stepNumber]);

  const goToPreviousStep = useCallback(async () => {
    if (!skuId) throw new Error("missing sku");
    if (stepNumber <= 1) throw new Error("no previous");
    const prevNum = stepNumber - 1;
    const supabase = createSupabaseBrowserClient();

    const { data, error } = await supabase
      .from("steps")
      .select("id")
      .eq("sku_id", skuId)
      .eq("step_number", prevNum)
      .maybeSingle();

    if (error || !data?.id) throw new Error("previous not found");
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

  const { voiceArmed, voiceAwake, voiceToast, toggleVoiceArm } = useLinkVoiceControl({
    onReplay: () => onReplay(),
    onPause: () => onPause(),
    onPlay: () => {
      if (endedOverlay) onReplay();
      else onResume();
    },
    onNext: () => goToNextStep(),
    onPrevious: () => goToPreviousStep()
  });

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
        <div className="text-sm text-zinc-600">Playback (this step only)</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <VoiceMicCluster
            voiceArmed={voiceArmed}
            voiceAwake={voiceAwake}
            onToggle={toggleVoiceArm}
          />
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

      <VoiceFeedbackBanners voiceArmed={voiceArmed} voiceAwake={voiceAwake} voiceToast={voiceToast} />

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
