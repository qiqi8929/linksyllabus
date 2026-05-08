"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createInactiveSkuWithSteps,
  type TutorialStepInput
} from "@/app/dashboard/serverActions";
import { FREE_TIER_UPGRADE_MESSAGE } from "@/lib/freeTier";
import { extractYouTubeVideoId } from "@/lib/video";

const TUTORIAL_CREATOR_DRAFT_KEY = "tutorialCreatorDraft.v1";

type Draft = {
  tutorialName?: string;
  videoSourceTab?: "youtube" | "upload";
  chapterVideoUrl?: string;
  steps?: Array<{
    step_name?: string;
    start_time?: number;
    end_time?: number;
    description?: string;
  }>;
  materialsText?: string;
  toolsText?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildPayloadFromDraft(parsed: Draft): {
  tutorialName: string;
  steps: TutorialStepInput[];
  defaultYoutubeUrl: string;
  materialsText: string;
  toolsText: string;
} | null {
  const name = String(parsed.tutorialName ?? "").trim();
  const chapter = String(parsed.chapterVideoUrl ?? "").trim();
  const tab = parsed.videoSourceTab === "upload" ? "upload" : "youtube";
  if (!name || !chapter) return null;
  if (tab === "youtube" && !extractYouTubeVideoId(chapter)) return null;

  const stepsRaw = Array.isArray(parsed.steps) ? parsed.steps : [];
  if (!stepsRaw.length) return null;

  const steps: TutorialStepInput[] = stepsRaw.map((s) => {
    const step_name = String(s?.step_name ?? "").trim();
    const description = String(s?.description ?? "").trim();
    const start_time = Math.max(0, Math.floor(Number(s?.start_time ?? 0)));
    const end_time = Math.floor(Number(s?.end_time ?? 60));
    return {
      step_name,
      description,
      youtube_url: chapter,
      start_time,
      end_time
    };
  });

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.step_name) return null;
    if (!Number.isFinite(s.end_time) || s.end_time <= s.start_time) return null;
  }

  return {
    tutorialName: name,
    steps,
    defaultYoutubeUrl: chapter,
    materialsText: String(parsed.materialsText ?? "").trim(),
    toolsText: String(parsed.toolsText ?? "").trim()
  };
}

export default function GuideUnlockCompletePage() {
  const [status, setStatus] = useState<"working" | "error">("working");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id")?.trim() ?? "";
    if (!sessionId) {
      setStatus("error");
      setMessage("Checkout did not return a session id. Open the dashboard and finish creating your tutorial there.");
      return;
    }

    const doneKey = `guideUnlockDone_${sessionId}`;
    const existingSku = sessionStorage.getItem(doneKey);
    if (existingSku) {
      window.location.replace(
        `/dashboard/success?checkout=success&skuId=${encodeURIComponent(
          existingSku
        )}&session_id=${encodeURIComponent(sessionId)}`
      );
      return;
    }

    let cancelled = false;

    async function run() {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(TUTORIAL_CREATOR_DRAFT_KEY);
      } catch {
        raw = null;
      }
      if (!raw) {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            "No saved draft was found. Your payment may still apply — open Create tutorial on the dashboard and try again."
          );
        }
        return;
      }

      let parsed: Draft;
      try {
        parsed = JSON.parse(raw) as Draft;
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Could not read your saved draft. Please recreate the tutorial on the dashboard.");
        }
        return;
      }

      const payload = buildPayloadFromDraft(parsed);
      if (!payload) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Your draft looks incomplete. Open the dashboard, review the form, and click Create tutorial.");
        }
        return;
      }

      const maxAttempts = 10;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (cancelled) return;
        try {
          const result = await createInactiveSkuWithSteps({
            tutorialName: payload.tutorialName,
            steps: payload.steps,
            defaultYoutubeUrl: payload.defaultYoutubeUrl,
            materialsText: payload.materialsText,
            toolsText: payload.toolsText
          });
          const skuId = result?.skuId;
          if (!skuId) {
            throw new Error("Tutorial was created but no id was returned.");
          }
          try {
            sessionStorage.setItem(doneKey, skuId);
            localStorage.removeItem(TUTORIAL_CREATOR_DRAFT_KEY);
          } catch {
            // non-fatal
          }
          window.location.replace(
            `/dashboard/success?checkout=success&skuId=${encodeURIComponent(
              skuId
            )}&session_id=${encodeURIComponent(sessionId)}`
          );
          return;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          const waitingOnWebhook =
            msg.includes(FREE_TIER_UPGRADE_MESSAGE) ||
            /guide limit|limit reached/i.test(msg);
          if (waitingOnWebhook && attempt < maxAttempts - 1) {
            await sleep(1200);
            continue;
          }
          if (!cancelled) {
            setStatus("error");
            setMessage(msg || "Could not finish creating your tutorial.");
          }
          return;
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "error") {
    return (
      <div className="card max-w-lg space-y-4 p-6">
        <h1 className="text-lg font-semibold text-zinc-900">Could not open your QR codes</h1>
        <p className="text-sm text-zinc-600 whitespace-pre-wrap">{message}</p>
        <Link className="btn-primary inline-block" href="/dashboard">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="card max-w-lg space-y-3 p-6">
      <h1 className="text-lg font-semibold text-zinc-900">Finishing your tutorial…</h1>
      <p className="text-sm text-zinc-600">
        Payment received. Creating your guide and opening the QR code page. This usually takes a few seconds.
      </p>
    </div>
  );
}
