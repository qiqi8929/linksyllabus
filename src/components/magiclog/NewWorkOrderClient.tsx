"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  MagicLogAiStep,
  MagicLogCreationMode,
  MagicLogVideoRef,
  CompetenceType
} from "@/lib/magiclog/types";
import { formatDurationClock } from "@/lib/youtubeSearch";
import { FormError } from "@/components/FormError";

type Phase =
  | "mode"
  | "voice"
  | "photo"
  | "task"
  | "video"
  | "steps"
  | "options"
  | "quick_log";

type DashboardEntryMode = "voice" | "photo" | "quick" | "learn";

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: {
    results: { length: number; [index: number]: { isFinal: boolean; 0?: { transcript?: string } } };
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const MODES: Array<{
  id: MagicLogCreationMode;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    id: "learn",
    title: "Learn & Record",
    description: "Find a video and generate step-by-step instructions",
    icon: "▶"
  },
  {
    id: "steps_only",
    title: "Steps Only",
    description: "Generate steps without video",
    icon: "☑"
  },
  {
    id: "quick_log",
    title: "Quick Log",
    description: "Just log hours and get mentor signature",
    icon: "⏱"
  }
];

function parseEntryMode(raw: string | null): DashboardEntryMode | null {
  if (raw === "voice" || raw === "photo" || raw === "quick" || raw === "learn") {
    return raw;
  }
  return null;
}

function initialPhase(entry: DashboardEntryMode | null): Phase {
  if (entry === "voice") return "voice";
  if (entry === "photo") return "photo";
  if (entry === "quick") return "quick_log";
  if (entry === "learn") return "mode";
  return "mode";
}

function initialCreationMode(entry: DashboardEntryMode | null): MagicLogCreationMode | null {
  if (entry === "quick") return "quick_log";
  return null;
}

export function NewWorkOrderClient({ defaultPeriod }: { defaultPeriod: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entryMode = parseEntryMode(searchParams.get("mode"));

  const [mode, setMode] = useState<MagicLogCreationMode | null>(() =>
    initialCreationMode(entryMode)
  );
  const [phase, setPhase] = useState<Phase>(() => initialPhase(entryMode));
  const [taskName, setTaskName] = useState("");
  const [videos, setVideos] = useState<MagicLogVideoRef[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<MagicLogVideoRef | null>(null);
  const [steps, setSteps] = useState<MagicLogAiStep[]>([]);
  const [competenceType, setCompetenceType] = useState<CompetenceType>("mandatory");
  const [period, setPeriod] = useState(defaultPeriod);
  const [quickHours, setQuickHours] = useState("");
  const [workedDate, setWorkedDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState("Press and hold the microphone, then release.");

  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const transcriptRef = useRef("");
  const voiceHandledRef = useRef(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMode(initialCreationMode(entryMode));
    setPhase(initialPhase(entryMode));
    setError(null);
  }, [entryMode]);

  function selectMode(next: MagicLogCreationMode) {
    setMode(next);
    setError(null);
    if (next === "quick_log") {
      setPhase("quick_log");
    } else {
      setPhase("task");
    }
  }

  async function saveWorkOrder(payload: Record<string, unknown>) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/magiclog/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      router.push(`/magiclog/work-order/${j.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  const generateStepsForTask = useCallback(async (name: string) => {
    const res = await fetch("/api/magiclog/generate-steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskName: name })
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "AI step generation failed");
    return (j.steps ?? []) as MagicLogAiStep[];
  }, []);

  const createStepsOnlyWorkOrder = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Enter a task name");
      const aiSteps = await generateStepsForTask(trimmed);
      await saveWorkOrder({
        taskName: trimmed,
        competenceName: trimmed,
        competenceType,
        period,
        aiSteps,
        videoUrls: [],
        includeVideo: false,
        creationMode: "steps_only"
      });
    },
    [competenceType, generateStepsForTask, period]
  );

  const processVoiceTranscript = useCallback(
    async (transcript: string) => {
      setError(null);
      setLoading(true);
      setVoiceHint("Processing with AI…");
      try {
        await createStepsOnlyWorkOrder(transcript);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Voice processing failed");
        setVoiceHint("Press and hold the microphone, then release.");
      } finally {
        setLoading(false);
      }
    },
    [createStepsOnlyWorkOrder]
  );

  const getSpeechRecognition = useCallback((): BrowserSpeechRecognition | null => {
    if (typeof window === "undefined") return null;
    const win = window as Window & {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = "en-CA";
    rec.continuous = true;
    rec.interimResults = true;
    return rec;
  }, []);

  const stopVoiceListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
    setListening(false);
  }, []);

  const startVoiceListening = useCallback(() => {
    if (loading) return;
    setError(null);
    const rec = getSpeechRecognition();
    if (!rec) {
      setError("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    transcriptRef.current = "";
    recognitionRef.current = rec;

    rec.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0]?.transcript ?? "";
      }
      transcriptRef.current = text.trim();
      if (event.results[event.results.length - 1]?.isFinal) {
        setVoiceHint(`Heard: “${transcriptRef.current.slice(0, 80)}${transcriptRef.current.length > 80 ? "…" : ""}”`);
      }
    };

    rec.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      setError(`Voice error: ${event.error}`);
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
      if (voiceHandledRef.current) return;
      const text = transcriptRef.current.trim();
      if (!text) {
        setError("No speech detected. Hold the button while you speak.");
        setVoiceHint("Press and hold the microphone, then release.");
        return;
      }
      voiceHandledRef.current = true;
      void processVoiceTranscript(text).finally(() => {
        voiceHandledRef.current = false;
      });
    };

    try {
      rec.start();
      setListening(true);
      setVoiceHint("Listening… release when done.");
    } catch {
      setError("Could not start microphone. Check browser permissions.");
    }
  }, [getSpeechRecognition, loading, processVoiceTranscript]);

  async function scanPhotoAndCreate(file: File) {
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/magiclog/scan-task", { method: "POST", body: form });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Photo scan failed");
      const scanned = String(j.fields?.taskName ?? "").trim();
      if (!scanned) {
        throw new Error("Could not identify a task from this photo. Try another angle.");
      }
      setTaskName(scanned);
      await createStepsOnlyWorkOrder(scanned);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Photo processing failed");
    } finally {
      setLoading(false);
    }
  }

  function onPhotoFile(file: File | undefined) {
    if (!file) return;
    void scanPhotoAndCreate(file);
  }

  async function searchVideos() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/magiclog/youtube-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskName })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Search failed");
      setVideos(j.results ?? []);
      setPhase("video");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function generateSteps(withVideo: boolean) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/magiclog/generate-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskName,
          youtubeUrl: withVideo && selectedVideo ? selectedVideo.url : undefined
        })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "AI step generation failed");
      setSteps(j.steps ?? []);
      setPhase("steps");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  function saveLearnOrSteps() {
    if (!mode) return;
    void saveWorkOrder({
      taskName,
      competenceName: taskName,
      competenceType,
      period,
      aiSteps: steps,
      videoUrls: mode === "learn" && selectedVideo ? [selectedVideo] : [],
      includeVideo: mode === "learn",
      creationMode: mode
    });
  }

  function saveQuickLog() {
    const h = Number(quickHours);
    if (!Number.isFinite(h) || h <= 0) {
      setError("Enter valid hours");
      return;
    }
    if (!workedDate.trim()) {
      setError("Select the date you worked");
      return;
    }
    void saveWorkOrder({
      taskName,
      competenceName: taskName,
      competenceType,
      period,
      hours: h,
      workedDate,
      creationMode: "quick_log",
      includeVideo: false,
      aiSteps: []
    });
  }

  const backHref =
    entryMode === "voice" || entryMode === "photo" || entryMode === "quick"
      ? "/magiclog/dashboard"
      : null;

  const pageTitle =
    entryMode === "voice"
      ? "Record voice"
      : entryMode === "photo"
        ? "Take photo"
        : entryMode === "quick"
          ? "Type it"
          : entryMode === "learn"
            ? "Learn with steps"
            : "New work order";

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{pageTitle}</h1>
        {backHref ? (
          <Link
            href={backHref}
            className="mt-2 inline-block text-xs text-zinc-500 hover:text-zinc-800"
          >
            ← Back to dashboard
          </Link>
        ) : phase !== "mode" && mode && entryMode === "learn" ? (
          <button
            type="button"
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-800"
            onClick={() => {
              setMode(null);
              setPhase("mode");
              setError(null);
            }}
          >
            ← Change mode
          </button>
        ) : null}
      </header>

      {phase === "voice" ? (
        <section className="card space-y-5 p-5 text-center">
          <p className="text-sm text-zinc-600">
            Say what you worked on in one sentence. We will turn it into a work order with AI
            steps.
          </p>
          <button
            type="button"
            className={`bb-voice-mic ${listening ? "bb-voice-mic--active" : ""}`}
            disabled={loading}
            aria-pressed={listening}
            onPointerDown={(e) => {
              e.preventDefault();
              startVoiceListening();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              stopVoiceListening();
            }}
            onPointerLeave={(e) => {
              if (listening) {
                e.preventDefault();
                stopVoiceListening();
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="bb-voice-mic-icon" aria-hidden>
              🎤
            </span>
          </button>
          <p className="text-sm text-zinc-500">{voiceHint}</p>
        </section>
      ) : null}

      {phase === "photo" ? (
        <section className="card space-y-4 p-5">
          <p className="text-sm text-zinc-600">
            Upload a photo or use your camera. AI will identify the task and create your work
            order.
          </p>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPhotoFile(e.target.files?.[0])}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPhotoFile(e.target.files?.[0])}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={loading}
              onClick={() => photoInputRef.current?.click()}
            >
              {loading ? "Processing…" : "Upload photo"}
            </button>
            <button
              type="button"
              className="btn-ghost flex-1"
              disabled={loading}
              onClick={() => cameraInputRef.current?.click()}
            >
              Take picture
            </button>
          </div>
        </section>
      ) : null}

      {phase === "mode" ? (
        <section className="bb-mode-grid">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="bb-mode-card"
              onClick={() => selectMode(m.id)}
            >
              <span className="bb-mode-icon" aria-hidden>
                {m.icon}
              </span>
              <span className="bb-mode-title">{m.title}</span>
              <span className="bb-mode-desc">{m.description}</span>
            </button>
          ))}
        </section>
      ) : null}

      {phase === "task" && mode === "learn" ? (
        <section className="card space-y-4 p-5">
          <label className="block text-sm font-medium">
            What task did you work on today?
          </label>
          <input
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="Install electrical branch circuits"
          />
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !taskName.trim()}
            onClick={searchVideos}
          >
            {loading ? "Searching…" : "Find YouTube videos"}
          </button>
        </section>
      ) : null}

      {phase === "task" && mode === "steps_only" ? (
        <section className="card space-y-4 p-5">
          <label className="block text-sm font-medium">
            What task did you work on today?
          </label>
          <input
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="Install electrical branch circuits"
          />
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !taskName.trim()}
            onClick={() => generateSteps(false)}
          >
            {loading ? "Generating steps…" : "Generate steps with AI"}
          </button>
        </section>
      ) : null}

      {phase === "video" && mode === "learn" ? (
        <section className="card space-y-4 p-5">
          <p className="text-sm font-medium">Select a video</p>
          <ul className="space-y-3">
            {videos.map((v) => (
              <li key={v.videoId}>
                <button
                  type="button"
                  className={`flex w-full gap-3 rounded-lg border p-3 text-left ${
                    selectedVideo?.videoId === v.videoId
                      ? "border-[#1D9E75] bg-[#e8f7f1]"
                      : "border-zinc-200"
                  }`}
                  onClick={() => setSelectedVideo(v)}
                >
                  {v.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbnailUrl}
                      alt=""
                      className="h-16 w-28 rounded object-cover"
                    />
                  ) : null}
                  <span>
                    <span className="block text-sm font-medium">{v.title}</span>
                    <span className="text-xs text-zinc-500">
                      {v.channel} · {formatDurationClock(v.durationSec ?? null)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-primary"
            disabled={!selectedVideo || loading}
            onClick={() => generateSteps(true)}
          >
            {loading ? "Generating steps…" : "Generate steps with AI"}
          </button>
        </section>
      ) : null}

      {(phase === "steps" || phase === "options") &&
      (mode === "learn" || mode === "steps_only") ? (
        <section className="space-y-4">
          <section className="card space-y-3 p-5">
            <p className="text-sm font-medium">Review steps</p>
            {steps.map((s, i) => (
              <section key={s.step_number} className="space-y-1 border-b border-zinc-100 pb-3">
                <input
                  className="font-medium"
                  value={s.title}
                  onChange={(e) => {
                    const next = [...steps];
                    next[i] = { ...s, title: e.target.value };
                    setSteps(next);
                  }}
                />
                <textarea
                  className="min-h-[60px] text-sm"
                  value={s.description}
                  onChange={(e) => {
                    const next = [...steps];
                    next[i] = { ...s, description: e.target.value };
                    setSteps(next);
                  }}
                />
              </section>
            ))}
            <button type="button" className="btn-ghost" onClick={() => setPhase("options")}>
              Continue to options
            </button>
          </section>

          {phase === "options" ? (
            <section className="card space-y-4 p-5">
              <section className="space-y-1">
                <span className="text-sm font-medium">Competence type</span>
                <select
                  value={competenceType}
                  onChange={(e) =>
                    setCompetenceType(e.target.value as CompetenceType)
                  }
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="mandatory">Mandatory</option>
                  <option value="optional">Optional</option>
                </select>
              </section>
              <section className="space-y-1">
                <span className="text-sm font-medium">Period</span>
                <select
                  value={period}
                  onChange={(e) => setPeriod(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      Period {n}
                    </option>
                  ))}
                </select>
              </section>
              <button
                type="button"
                className="btn-primary"
                disabled={loading}
                onClick={saveLearnOrSteps}
              >
                {loading ? "Saving…" : "Save work order"}
              </button>
            </section>
          ) : null}
        </section>
      ) : null}

      {phase === "quick_log" && mode === "quick_log" ? (
        <section className="card space-y-4 p-5">
          <p className="text-sm text-zinc-600">
            Log your work and collect a mentor signature on your My Bluebook page (no learning
            steps or video).
          </p>
          <label className="block text-sm font-medium">
            What task did you work on?
            <input
              className="mt-1 w-full"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Rough-in commercial branch circuits"
            />
          </label>
          <label className="block text-sm font-medium">
            Hours worked
            <input
              type="number"
              min={0.25}
              step={0.25}
              className="mt-1 w-full"
              value={quickHours}
              onChange={(e) => setQuickHours(e.target.value)}
              placeholder="e.g. 4"
            />
          </label>
          <label className="block text-sm font-medium">
            Date worked
            <input
              type="date"
              className="mt-1 w-full"
              value={workedDate}
              onChange={(e) => setWorkedDate(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Competence type
            <select
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={competenceType}
              onChange={(e) => setCompetenceType(e.target.value as CompetenceType)}
            >
              <option value="mandatory">Mandatory</option>
              <option value="optional">Optional</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Period
            <select
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  Period {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !taskName.trim()}
            onClick={saveQuickLog}
          >
            {loading ? "Saving…" : "Create work order"}
          </button>
        </section>
      ) : null}

      <FormError message={error} />
    </section>
  );
}
