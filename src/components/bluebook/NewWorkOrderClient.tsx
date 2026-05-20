"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BluebookAiStep, BluebookVideoRef, CompetenceType } from "@/lib/bluebook/types";
import { formatDurationClock } from "@/lib/youtubeSearch";
import { FormError } from "@/components/FormError";

type Phase = "task" | "video" | "steps" | "options";

export function NewWorkOrderClient({ defaultPeriod }: { defaultPeriod: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("task");
  const [taskName, setTaskName] = useState("");
  const [videos, setVideos] = useState<BluebookVideoRef[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<BluebookVideoRef | null>(null);
  const [steps, setSteps] = useState<BluebookAiStep[]>([]);
  const [includeVideo, setIncludeVideo] = useState(true);
  const [competenceType, setCompetenceType] = useState<CompetenceType>("mandatory");
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function generateSteps() {
    if (!selectedVideo) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/bluebook/generate-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskName,
          youtubeUrl: selectedVideo.url
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

  async function saveDraft() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/bluebook/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskName,
          competenceName: taskName,
          competenceType,
          period,
          aiSteps: steps,
          videoUrls: selectedVideo ? [selectedVideo] : [],
          includeVideo
        })
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New work order</h1>

      {phase === "task" ? (
        <div className="card space-y-4 p-5">
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
        </div>
      ) : null}

      {phase === "video" ? (
        <div className="card space-y-4 p-5">
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
            onClick={generateSteps}
          >
            {loading ? "Generating steps…" : "Generate steps with AI"}
          </button>
        </div>
      ) : null}

      {phase === "steps" || phase === "options" ? (
        <div className="space-y-4">
          <div className="card space-y-3 p-5">
            <p className="text-sm font-medium">Review steps</p>
            {steps.map((s, i) => (
              <div key={s.step_number} className="space-y-1 border-b border-zinc-100 pb-3">
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
              </div>
            ))}
            <button type="button" className="btn-ghost" onClick={() => setPhase("options")}>
              Continue to options
            </button>
          </div>

          {phase === "options" ? (
            <div className="card space-y-4 p-5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeVideo}
                  onChange={(e) => setIncludeVideo(e.target.checked)}
                />
                Include video QR codes
              </label>
              <div className="space-y-1">
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
              </div>
              <div className="space-y-1">
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
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={loading}
                onClick={saveDraft}
              >
                {loading ? "Saving…" : "Save work order"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <FormError message={error} />
    </div>
  );
}



