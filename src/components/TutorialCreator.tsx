"use client";

import { useCallback, useState } from "react";
import {
  createInactiveSkuWithSteps,
  type TutorialStepInput
} from "@/app/dashboard/serverActions";
import { extractYouTubeVideoId } from "@/lib/video";

type StepRow = {
  id: string;
  step_name: string;
  video_url: string;
  start_time: number;
  end_time: number;
  description: string;
};

function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return String(Math.random()).slice(2);
}

function emptyStep(): StepRow {
  return {
    id: makeId(),
    step_name: "",
    video_url: "",
    start_time: 0,
    end_time: 60,
    description: ""
  };
}

async function startCheckout(skuId: string) {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "sku", skuId })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Checkout failed");
  }
  const data = (await res.json()) as { url?: string };
  if (!data?.url) throw new Error("Missing checkout URL");
  window.location.href = data.url;
}

export function TutorialCreator() {
  const [tutorialName, setTutorialName] = useState("");
  const [steps, setSteps] = useState<StepRow[]>(() => [emptyStep()]);
  const [aiLoading, setAiLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [chapterVideoUrl, setChapterVideoUrl] = useState("");
  const [descExtractLoading, setDescExtractLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateStep = useCallback((id: string, patch: Partial<StepRow>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const addRow = useCallback(() => {
    setSteps((prev) => [...prev, emptyStep()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  }, []);

  const buildStepPayload = useCallback((): TutorialStepInput[] => {
    return steps.map((s) => ({
      step_name: s.step_name.trim(),
      description: s.description.trim(),
      youtube_url: s.video_url.trim(),
      start_time: s.start_time,
      end_time: s.end_time
    }));
  }, [steps]);

  const validateSteps = useCallback((): string | null => {
    const name = tutorialName.trim();
    if (!name) return "Please enter a tutorial name.";
    if (!steps.length) return "Add at least one step.";
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s.step_name.trim() || !s.video_url.trim()) {
        return `Step ${i + 1}: enter a step name and video URL.`;
      }
      if (
        !Number.isFinite(s.start_time) ||
        !Number.isFinite(s.end_time) ||
        s.end_time <= s.start_time
      ) {
        return `Step ${i + 1}: end time must be greater than start time (seconds).`;
      }
    }
    return null;
  }, [tutorialName, steps]);

  const extractTimestampsFromYouTubeVideo = async () => {
    const url = chapterVideoUrl.trim();
    if (!url) {
      setError("Paste a YouTube URL above to auto-extract timestamps.");
      return;
    }
    if (!extractYouTubeVideoId(url)) {
      setError("Use a valid YouTube URL.");
      return;
    }
    const stepNames = steps.map((s) => s.step_name.trim()).filter(Boolean);
    if (stepNames.length === 0) {
      setError("Enter at least one step name in the steps below.");
      return;
    }
    setError(null);
    setDescExtractLoading(true);
    try {
      const res = await fetch("/api/gemini/extract-timestamps-from-description", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ youtubeUrl: url, stepNames })
      });
      const data = (await res.json()) as {
        steps?: Array<{ stepName: string; start_time: number; end_time: number }>;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Could not extract timestamps.");
      }
      const list = data.steps ?? [];
      if (!list.length) {
        throw new Error("The model did not return timestamps for any step.");
      }
      const byName = new Map(
        list.map((s) => [s.stepName.trim(), s] as const)
      );
      let matched = 0;
      setSteps((prev) =>
        prev.map((row) => {
          const m = byName.get(row.step_name.trim());
          if (!m) return row;
          matched += 1;
          return {
            ...row,
            video_url: url,
            start_time: Math.floor(m.start_time),
            end_time: Math.floor(m.end_time)
          };
        })
      );
      if (matched === 0) {
        throw new Error(
          "No step names matched the response. Use the exact same labels you asked the model to find."
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Timestamp extraction failed.");
    } finally {
      setDescExtractLoading(false);
    }
  };

  const onGenerateAi = async () => {
    setError(null);
    const v = validateSteps();
    if (v) {
      setError(v);
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch("/api/gemini/generate-descriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tutorialName: tutorialName.trim(),
          steps: steps.map((s) => ({
            stepName: s.step_name.trim(),
            videoUrl: s.video_url.trim(),
            startTime: s.start_time,
            endTime: s.end_time
          }))
        })
      });
      const data = (await res.json()) as { descriptions?: string[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "AI request failed");
      }
      const descriptions = data.descriptions;
      if (!descriptions || descriptions.length !== steps.length) {
        throw new Error("Unexpected AI response shape.");
      }
      setSteps((prev) =>
        prev.map((row, i) => ({ ...row, description: descriptions[i] ?? "" }))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "AI generation failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const onPay = async () => {
    setError(null);
    const v = validateSteps();
    if (v) {
      setError(v);
      return;
    }
    setPayLoading(true);
    try {
      const payload = buildStepPayload();
      const result = await createInactiveSkuWithSteps({
        tutorialName: tutorialName.trim(),
        steps: payload
      });
      const skuId = result?.skuId;
      if (!skuId) {
        throw new Error("Could not create tutorial (missing id). Please try again.");
      }
      await startCheckout(skuId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not start checkout.");
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Create tutorial</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Add all steps on this page, generate descriptions with AI, then pay to publish and get QR codes.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="card space-y-4 p-6">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="tutorial-name">
            Tutorial name
          </label>
          <input
            id="tutorial-name"
            value={tutorialName}
            onChange={(e) => setTutorialName(e.target.value)}
            placeholder="e.g. DS-160 walkthrough"
            className="w-full"
          />
        </div>

        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
          <label className="text-sm font-medium" htmlFor="chapter-youtube-url">
            YouTube URL (same video for the steps below)
          </label>
          <input
            id="chapter-youtube-url"
            value={chapterVideoUrl}
            onChange={(e) => setChapterVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className="w-full"
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={
                descExtractLoading ||
                !chapterVideoUrl.trim() ||
                !steps.some((s) => s.step_name.trim())
              }
              onClick={() => void extractTimestampsFromYouTubeVideo()}
            >
              {descExtractLoading ? "Analyzing video…" : "✨ Auto-extract timestamps"}
            </button>
            <span className="text-xs text-zinc-500">
              Uses YouTube captions plus Gemini to match step names to clip times (no YouTube Data API).
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Steps</span>
            <button type="button" className="btn-ghost text-sm" onClick={addRow}>
              + Add step
            </button>
          </div>

          <div className="space-y-4">
            {steps.map((row, index) => (
              <div
                key={row.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Step {index + 1}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost text-xs text-red-700"
                    onClick={() => removeRow(row.id)}
                    disabled={steps.length <= 1}
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs text-zinc-600">Step name</label>
                    <input
                      value={row.step_name}
                      onChange={(e) => updateStep(row.id, { step_name: e.target.value })}
                      placeholder="Short label for this segment"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs text-zinc-600">YouTube or Vimeo URL</label>
                    <input
                      value={row.video_url}
                      onChange={(e) => updateStep(row.id, { video_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-600">Start (seconds)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={row.start_time}
                      onChange={(e) =>
                        updateStep(row.id, { start_time: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-600">End (seconds)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={row.end_time}
                      onChange={(e) =>
                        updateStep(row.id, { end_time: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={aiLoading}
            onClick={onGenerateAi}
          >
            {aiLoading ? "Generating…" : "Generate with AI"}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={payLoading}
            onClick={onPay}
          >
            {payLoading ? "Redirecting…" : "Pay $19.90"}
          </button>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-800">Preview</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Tutorial: {tutorialName.trim() || "—"}
        </p>
        <ul className="mt-4 space-y-4">
          {steps.map((row, i) => (
            <li key={row.id} className="border-b border-zinc-100 pb-4 last:border-0 last:pb-0">
              <div className="text-sm font-medium text-zinc-900">
                {i + 1}. {row.step_name.trim() || "(untitled step)"}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Clip: {row.start_time}s → {row.end_time}s
              </div>
              {row.description.trim() ? (
                <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-600">
                  {row.description}
                </div>
              ) : (
                <div className="mt-2 text-sm text-zinc-400 italic">No description yet.</div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
