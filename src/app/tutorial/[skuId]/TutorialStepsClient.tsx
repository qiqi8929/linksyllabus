"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { YouTubePlayerClient, VimeoPlayerClient } from "@/app/play/[id]/player";
import {
  detectVideoKind,
  extractVimeoVideoId,
  extractYouTubeVideoId
} from "@/lib/video";

export type TutorialStepPayload = {
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
  steps: TutorialStepPayload[];
};

export function TutorialStepsClient({ skuId, steps }: Props) {
  const [activeId, setActiveId] = useState<string | null>(() => steps[0]?.id ?? null);

  useEffect(() => {
    if (steps.length && !steps.some((s) => s.id === activeId)) {
      setActiveId(steps[0].id);
    }
  }, [steps, activeId]);

  const active = steps.find((s) => s.id === activeId) ?? null;

  const renderPlayer = useCallback(() => {
    if (!active) {
      return (
        <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
          Select a step to watch this clip.
        </div>
      );
    }

    const kind = detectVideoKind(active.youtube_url);
    const youtubeId = extractYouTubeVideoId(active.youtube_url);
    const vimeoId = extractVimeoVideoId(active.youtube_url);
    const showYoutube = kind === "youtube" && Boolean(youtubeId);
    const showVimeo = kind === "vimeo" && Boolean(vimeoId);

    if (showYoutube && youtubeId) {
      return (
        <div key={active.id} className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
          <YouTubePlayerClient
            playbackId={active.id}
            videoId={youtubeId}
            startTime={active.start_time}
            endTime={active.end_time}
            skuId={skuId}
            stepNumber={active.step_number}
          />
        </div>
      );
    }

    if (showVimeo && vimeoId) {
      return (
        <div key={active.id} className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
          <VimeoPlayerClient
            playbackId={active.id}
            vimeoId={vimeoId}
            startTime={active.start_time}
            endTime={active.end_time}
            skuId={skuId}
            stepNumber={active.step_number}
          />
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        This step does not use a supported YouTube or Vimeo URL. Open the{" "}
        <Link className="font-medium text-brand underline" href={`/play/${active.id}`}>
          single-step player
        </Link>{" "}
        if available.
      </div>
    );
  }, [active, skuId]);

  return (
    <div className="space-y-8">
      <p className="text-sm text-zinc-500 md:hidden">
        Tip: step QR codes open{" "}
        <span className="font-medium text-zinc-700">/play/…</span> for a focused mobile view.
      </p>

      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="space-y-3 lg:col-span-5 lg:order-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Steps</h2>
          <ol className="space-y-3">
            {steps.map((step) => {
              const isOpen = step.id === activeId;
              return (
                <li key={step.id}>
                  <div
                    className={`overflow-hidden rounded-xl border transition ${
                      isOpen
                        ? "border-brand bg-brand/5 shadow-sm ring-1 ring-brand/20"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveId(step.id)}
                      className="w-full p-4 text-left focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand/40"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isOpen
                              ? "bg-brand text-white"
                              : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {step.step_number}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-zinc-900">{step.step_name}</div>
                          {step.description ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
                              {step.description}
                            </p>
                          ) : (
                            <p className="mt-2 text-sm italic text-zinc-400">No description.</p>
                          )}
                          <p className="mt-2 text-xs text-zinc-400">
                            Clip {step.start_time}s – {step.end_time}s
                          </p>
                        </div>
                      </div>
                    </button>
                    <div className="border-t border-zinc-100 bg-zinc-50/80 px-4 py-2 text-xs text-zinc-500">
                      <Link
                        className="font-medium text-brand hover:underline"
                        href={`/play/${step.id}`}
                      >
                        Mobile / QR player →
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="space-y-3 lg:sticky lg:top-6 lg:col-span-7 lg:order-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Video</h2>
          {renderPlayer()}
        </div>
      </div>

    </div>
  );
}
