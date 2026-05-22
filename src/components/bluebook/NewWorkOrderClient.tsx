"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BluebookAiStep,
  BluebookCreationMode,
  BluebookVideoRef,
  CompetenceType
} from "@/lib/bluebook/types";
import { formatDurationClock } from "@/lib/youtubeSearch";
import { FormError } from "@/components/FormError";

type Phase = "mode" | "task" | "video" | "steps" | "options" | "quick_log";

const MODES: Array<{
  id: BluebookCreationMode;
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

export function NewWorkOrderClient({ defaultPeriod }: { defaultPeriod: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<BluebookCreationMode | null>(null);
  const [phase, setPhase] = useState<Phase>("mode");
  const [taskName, setTaskName] = useState("");
  const [videos, setVideos] = useState<BluebookVideoRef[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<BluebookVideoRef | null>(null);
  const [steps, setSteps] = useState<BluebookAiStep[]>([]);
  const [competenceType, setCompetenceType] = useState<CompetenceType>("mandatory");
  const [period, setPeriod] = useState(defaultPeriod);
  const [quickHours, setQuickHours] = useState("");
  const [workedDate, setWorkedDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectMode(next: BluebookCreationMode) {
    setMode(next);
    setError(null);
    if (next === "quick_log") {
      setPhase("quick_log");
    } else {
      setPhase("task");
    }
  }

  async function searchVideos() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/bluebook/youtube-search", {
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
      const res = await fetch("/api/bluebook/generate-steps", {
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

  async function saveWorkOrder(payload: Record<string, unknown>) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/bluebook/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      router.push(`/bluebook/work-order/${j.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
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

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">New work order</h1>
        {phase !== "mode" && mode ? (
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
                      ? "border-orange-500 bg-orange-50"
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
