"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  updateTutorialAction,
  type TutorialStepUpdateInput
} from "@/app/dashboard/serverActions";
import { extractYouTubeVideoId } from "@/lib/video";

type StepRow = {
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
  initialName: string;
  initialDescription: string;
  initialMaterials: string;
  initialTools: string;
  steps: StepRow[];
};

export function TutorialEditForm({
  skuId,
  initialName,
  initialDescription,
  initialMaterials,
  initialTools,
  steps: initialSteps
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [materialsText, setMaterialsText] = useState(initialMaterials);
  const [toolsText, setToolsText] = useState(initialTools);
  const [steps, setSteps] = useState<StepRow[]>(initialSteps);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [materialsExtractLoading, setMaterialsExtractLoading] = useState(false);

  const primaryYoutubeUrl = useMemo(() => {
    const s = steps.find((x) => x.youtube_url?.trim());
    return s?.youtube_url?.trim() ?? "";
  }, [steps]);

  const updateStep = useCallback((id: string, patch: Partial<StepRow>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const extractMaterialsFromTranscript = async () => {
    const url = primaryYoutubeUrl;
    if (!url) {
      setError("Add a YouTube URL on at least one step first.");
      return;
    }
    if (!extractYouTubeVideoId(url)) {
      setError("Use a valid YouTube URL on the step.");
      return;
    }
    setError(null);
    setMaterialsExtractLoading(true);
    try {
      const res = await fetch("/api/gemini/extract-materials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ youtubeUrl: url })
      });
      const data = (await res.json()) as {
        materials?: string;
        tools?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Could not extract materials & tools.");
      }
      setMaterialsText(String(data.materials ?? "").trim());
      setToolsText(String(data.tools ?? "").trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Materials extraction failed.");
    } finally {
      setMaterialsExtractLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: {
        name: string;
        description: string;
        materialsText: string;
        toolsText: string;
        steps: TutorialStepUpdateInput[];
      } = {
        name,
        description,
        materialsText: materialsText.trim(),
        toolsText: toolsText.trim(),
        steps: steps.map((s) => ({
          id: s.id,
          step_name: s.step_name,
          description: s.description,
          youtube_url: s.youtube_url,
          start_time: s.start_time,
          end_time: s.end_time
        }))
      };
      await updateTutorialAction(skuId, payload);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-8" onSubmit={(e) => void onSubmit(e)}>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-zinc-800">Tutorial</h2>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="edit-name">
            Name
          </label>
          <input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="edit-desc">
            Description (shown on the public tutorial page)
          </label>
          <textarea
            id="edit-desc"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
            Materials & Tools
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            List everything your viewer needs before they start
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost text-sm"
            disabled={materialsExtractLoading || !primaryYoutubeUrl}
            onClick={() => void extractMaterialsFromTranscript()}
          >
            {materialsExtractLoading
              ? "Extracting…"
              : "✨ Auto-extract materials & tools"}
          </button>
          <span className="text-xs text-zinc-500">
            Uses captions from the first step&apos;s video URL + Gemini.
          </span>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-900" htmlFor="edit-materials">
            Materials
          </label>
          <textarea
            id="edit-materials"
            rows={4}
            value={materialsText}
            onChange={(e) => setMaterialsText(e.target.value)}
            placeholder={`List each material on a new line with specific details.
Example:
- Worsted weight yarn (100g, any color)
- Size 4mm crochet hook`}
            className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-900" htmlFor="edit-tools">
            Tools
          </label>
          <textarea
            id="edit-tools"
            rows={3}
            value={toolsText}
            onChange={(e) => setToolsText(e.target.value)}
            placeholder={`List each tool on a new line.
Example:
- 4mm crochet hook
- Scissors
- Tapestry needle`}
            className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-800">Steps</h2>
        {steps.map((s) => (
          <div key={s.id} className="card space-y-3 p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Step {s.step_number}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-600">Step name</label>
              <input
                value={s.step_name}
                onChange={(e) => updateStep(s.id, { step_name: e.target.value })}
                className="w-full"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-600">Description</label>
              <textarea
                rows={3}
                value={s.description}
                onChange={(e) =>
                  updateStep(s.id, { description: e.target.value })
                }
                className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-600">Video URL (YouTube or Vimeo)</label>
              <input
                value={s.youtube_url}
                onChange={(e) =>
                  updateStep(s.id, { youtube_url: e.target.value })
                }
                className="w-full"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-zinc-600">Start (seconds)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={s.start_time}
                  onChange={(e) =>
                    updateStep(s.id, { start_time: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-600">End (seconds)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={s.end_time}
                  onChange={(e) =>
                    updateStep(s.id, { end_time: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <Link className="btn-ghost" href="/dashboard">
          Cancel
        </Link>
      </div>
    </form>
  );
}
