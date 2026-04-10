"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createInactiveSkuWithSteps,
  type TutorialStepInput
} from "@/app/dashboard/serverActions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  buildStorageVideoRef,
  parseStorageVideoPath,
  TUTORIAL_VIDEO_BUCKET
} from "@/lib/storageVideoUrl";
import { parseAiTutorialPaste } from "@/lib/parseAiTutorialPaste";
import { extractYouTubeVideoId } from "@/lib/video";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const UPLOAD_ACCEPT = new Set(["mp4", "mov", "avi"]);

function mimeForExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "mp4") return "video/mp4";
  if (e === "mov") return "video/quicktime";
  if (e === "avi") return "video/x-msvideo";
  return "video/mp4";
}

type StepRow = {
  id: string;
  step_name: string;
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
    start_time: 0,
    end_time: 60,
    description: ""
  };
}

/** POST /api/* with session cookie; surfaces non-JSON errors (e.g. Vercel timeout HTML). */
async function fetchJsonFromApi(
  url: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(
      text.slice(0, 280) ||
        `Server returned non-JSON (HTTP ${res.status}). If this persists, check Vercel logs / function timeout.`
    );
  }
  if (!res.ok) {
    let msg = String(data.error ?? `Request failed (HTTP ${res.status}).`);
    const dbg = data.debug;
    if (dbg !== undefined && dbg !== null) {
      try {
        msg += `\n\n— Debug —\n${JSON.stringify(dbg, null, 2)}`;
      } catch {
        msg += `\n\n— Debug —\n${String(dbg)}`;
      }
    }
    throw new Error(msg);
  }
  return data;
}

async function startCheckout(skuId: string) {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
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
  const [videoSourceTab, setVideoSourceTab] = useState<"youtube" | "upload">("youtube");
  const [chapterVideoUrl, setChapterVideoUrl] = useState("");
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [descExtractLoading, setDescExtractLoading] = useState(false);
  const [materialsExtractLoading, setMaterialsExtractLoading] = useState(false);
  const [materialsText, setMaterialsText] = useState("");
  const [toolsText, setToolsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fullAutoLoading, setFullAutoLoading] = useState(false);
  const [pasteImportText, setPasteImportText] = useState("");
  /** True when the server fell back to title-based time estimates (rare). */
  const [outlineEstimated, setOutlineEstimated] = useState(false);

  useEffect(() => {
    const path = parseStorageVideoPath(chapterVideoUrl);
    if (!path) {
      setUploadPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.storage
        .from(TUTORIAL_VIDEO_BUCKET)
        .createSignedUrl(path, 3600);
      if (!cancelled && data?.signedUrl) {
        setUploadPreviewUrl(data.signedUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterVideoUrl]);

  useEffect(() => {
    setOutlineEstimated(false);
  }, [chapterVideoUrl, videoSourceTab]);

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
    const chapter = chapterVideoUrl.trim();
    return steps.map((s) => ({
      step_name: s.step_name.trim(),
      description: s.description.trim(),
      youtube_url: chapter,
      start_time: s.start_time,
      end_time: s.end_time
    }));
  }, [steps, chapterVideoUrl]);

  const validateSteps = useCallback((): string | null => {
    const name = tutorialName.trim();
    if (!name) return "Please enter a tutorial name.";
    if (!steps.length) return "Add at least one step.";
    const chapter = chapterVideoUrl.trim();
    if (!chapter) {
      return videoSourceTab === "youtube"
        ? "Paste the YouTube URL for this tutorial above."
        : "Upload a video file for this tutorial.";
    }
    if (videoSourceTab === "youtube" && !extractYouTubeVideoId(chapter)) {
      return "Use a valid YouTube URL.";
    }
    if (videoSourceTab === "upload" && !parseStorageVideoPath(chapter)) {
      return "Upload a video file (MP4, MOV, or AVI).";
    }
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s.step_name.trim()) {
        return `Step ${i + 1}: enter a step name.`;
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
  }, [tutorialName, steps, chapterVideoUrl, videoSourceTab]);

  const uploadChapterFile = async (file: File) => {
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!UPLOAD_ACCEPT.has(ext)) {
      setError("Use an MP4, MOV, or AVI file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Video must be 500MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be logged in to upload.");
        return;
      }
      const signed = await fetchJsonFromApi("/api/video/create-signed-upload", { ext });
      const path = String(signed.path ?? "").trim();
      const token = String(signed.token ?? "").trim();
      if (!path || !token) {
        throw new Error("Server did not return a signed upload token.");
      }
      const { data: upData, error: upErr } = await supabase.storage
        .from(TUTORIAL_VIDEO_BUCKET)
        .uploadToSignedUrl(path, token, file, {
          upsert: false
        });
      if (upErr) {
        console.error("[uploadChapterFile] supabase upload error", {
          bucket: TUTORIAL_VIDEO_BUCKET,
          path,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          error: upErr
        });
        throw new Error(upErr.message);
      }
      console.log("[uploadChapterFile] upload success", {
        bucket: TUTORIAL_VIDEO_BUCKET,
        path,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        response: upData
      });
      setChapterVideoUrl(buildStorageVideoRef(path));
    } catch (e: unknown) {
      console.error("[uploadChapterFile] unexpected upload exception", {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        error: e
      });
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const extractTimestampsFromYouTubeVideo = async () => {
    const url = chapterVideoUrl.trim();
    if (!url) {
      setError(
        videoSourceTab === "youtube"
          ? "Paste a YouTube URL above to auto-extract timestamps."
          : "Upload a video first."
      );
      return;
    }
    if (videoSourceTab === "youtube" && !extractYouTubeVideoId(url)) {
      setError("Use a valid YouTube URL.");
      return;
    }
    if (videoSourceTab === "upload") {
      const p = parseStorageVideoPath(url);
      if (!p) {
        setError("Upload a video file first.");
        return;
      }
    }
    setError(null);
    setDescExtractLoading(true);
    try {
      const storagePath = parseStorageVideoPath(url);
      const data = await fetchJsonFromApi(
        "/api/gemini/extract-timestamps-from-description",
        storagePath ? { storagePath } : { youtubeUrl: url }
      );
      const rawSteps = data.steps;
      const list = Array.isArray(rawSteps) ? rawSteps : [];
      if (!list.length) {
        throw new Error("The model did not return any instructional steps.");
      }
      setOutlineEstimated(data.estimated === true);
      setMaterialsText(
        String(data.materialsText ?? data.materials_text ?? "").trim()
      );
      setToolsText(String(data.toolsText ?? data.tools_text ?? "").trim());
      const mapped = list.map((item) => {
        const s = item as Record<string, unknown>;
        const stepName = String(s.stepName ?? s.step_name ?? "").trim();
        const description = String(s.description ?? "").trim();
        const start = Math.floor(Number(s.start_time ?? s.startTime ?? 0));
        const end = Math.floor(Number(s.end_time ?? s.endTime ?? 0));
        return {
          id: makeId(),
          step_name: stepName,
          description,
          start_time: start,
          end_time: end
        };
      });
      const withNames = mapped.filter((row) => row.step_name.length > 0);
      if (!withNames.length) {
        throw new Error(
          "The model returned steps without titles. Try again or add steps manually."
        );
      }
      setSteps(withNames);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Timestamp extraction failed.");
    } finally {
      setDescExtractLoading(false);
    }
  };

  /** One click: structure from video, then materials/tools only if still empty. */
  const runFullAutoFromVideo = async () => {
    const url = chapterVideoUrl.trim();
    if (!url) {
      setError(
        videoSourceTab === "youtube"
          ? "Paste a YouTube URL above first."
          : "Upload a video first."
      );
      return;
    }
    if (videoSourceTab === "youtube" && !extractYouTubeVideoId(url)) {
      setError("Use a valid YouTube URL.");
      return;
    }
    if (videoSourceTab === "upload") {
      const p = parseStorageVideoPath(url);
      if (!p) {
        setError("Upload a video file first.");
        return;
      }
    }
    setError(null);
    setFullAutoLoading(true);
    try {
      const storagePath = parseStorageVideoPath(url);
      const data = await fetchJsonFromApi(
        "/api/gemini/extract-timestamps-from-description",
        storagePath ? { storagePath } : { youtubeUrl: url }
      );
      const rawSteps = data.steps;
      const list = Array.isArray(rawSteps) ? rawSteps : [];
      if (!list.length) {
        throw new Error("The model did not return any instructional steps.");
      }
      setOutlineEstimated(data.estimated === true);
      const mat = String(data.materialsText ?? data.materials_text ?? "").trim();
      const tools = String(data.toolsText ?? data.tools_text ?? "").trim();
      setMaterialsText(mat);
      setToolsText(tools);
      const mapped = list.map((item) => {
        const s = item as Record<string, unknown>;
        const stepName = String(s.stepName ?? s.step_name ?? "").trim();
        const description = String(s.description ?? "").trim();
        const start = Math.floor(Number(s.start_time ?? s.startTime ?? 0));
        const end = Math.floor(Number(s.end_time ?? s.endTime ?? 0));
        return {
          id: makeId(),
          step_name: stepName,
          description,
          start_time: start,
          end_time: end
        };
      });
      const withNames = mapped.filter((row) => row.step_name.length > 0);
      if (!withNames.length) {
        throw new Error(
          "The model returned steps without titles. Try again or add steps manually."
        );
      }
      setSteps(withNames);

      const needsMaterials = !mat && !tools;
      if (needsMaterials) {
        const matData = await fetchJsonFromApi(
          "/api/gemini/extract-materials",
          storagePath ? { storagePath } : { youtubeUrl: url }
        );
        setMaterialsText(String(matData.materials ?? "").trim());
        setToolsText(String(matData.tools ?? "").trim());
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Auto-fill from video failed.");
    } finally {
      setFullAutoLoading(false);
    }
  };

  const applyPasteImport = () => {
    setError(null);
    const result = parseAiTutorialPaste(pasteImportText);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.tutorialName) {
      setTutorialName(result.tutorialName);
    }
    setOutlineEstimated(false);
    setMaterialsText(result.materialsText);
    setToolsText(result.toolsText);
    setSteps(
      result.steps.map((s) => ({
        id: makeId(),
        step_name: s.step_name,
        description: s.description,
        start_time: s.start_time,
        end_time: s.end_time
      }))
    );
    setPasteImportText("");
  };

  const extractMaterialsFromTranscript = async () => {
    const url = chapterVideoUrl.trim();
    if (!url) {
      setError(
        videoSourceTab === "youtube"
          ? "Paste a YouTube URL above to extract materials & tools."
          : "Upload a video first."
      );
      return;
    }
    if (videoSourceTab === "youtube" && !extractYouTubeVideoId(url)) {
      setError("Use a valid YouTube URL.");
      return;
    }
    if (videoSourceTab === "upload" && !parseStorageVideoPath(url)) {
      setError("Upload a video file first.");
      return;
    }
    setError(null);
    setMaterialsExtractLoading(true);
    try {
      const storagePath = parseStorageVideoPath(url);
      const data = await fetchJsonFromApi(
        "/api/gemini/extract-materials",
        storagePath ? { storagePath } : { youtubeUrl: url }
      );
      setMaterialsText(String(data.materials ?? "").trim());
      setToolsText(String(data.tools ?? "").trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Materials extraction failed.");
    } finally {
      setMaterialsExtractLoading(false);
    }
  };

  const onGenerateAi = async () => {
    setError(null);
    const v = validateSteps();
    if (v) {
      setError(v);
      return;
    }
    const chapter = chapterVideoUrl.trim();
    setAiLoading(true);
    try {
      const data = await fetchJsonFromApi("/api/gemini/generate-descriptions", {
        tutorialName: tutorialName.trim(),
        steps: steps.map((s) => ({
          stepName: s.step_name.trim(),
          videoUrl: chapter,
          startTime: s.start_time,
          endTime: s.end_time
        }))
      });
      const descriptions = data.descriptions as string[] | undefined;
      if (!descriptions || descriptions.length !== steps.length) {
        throw new Error("Unexpected AI response shape.");
      }
      setSteps((prev) =>
        prev.map((row, i) => {
          const generated = descriptions[i] ?? "";
          const hadUserText = row.description.trim().length > 0;
          return {
            ...row,
            description: hadUserText ? row.description : generated
          };
        })
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
        steps: payload,
        defaultYoutubeUrl: chapterVideoUrl.trim(),
        materialsText: materialsText.trim(),
        toolsText: toolsText.trim()
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
          Link your video and click <span className="font-medium text-zinc-700">Fill from video</span>
          — Gemini analyzes the video directly (YouTube URL or your upload). Then pay to publish and get
          QR codes.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{error}</p>
          {/not configured|GEMINI_API_KEY|missing.*API/i.test(error) ? (
            <p className="mt-3 border-t border-red-200/80 pt-3 text-xs font-sans leading-relaxed text-red-900">
              Set <code className="rounded bg-red-100/80 px-1">GEMINI_API_KEY</code> in the server
              environment (see project <code className="rounded bg-red-100/80 px-1">.env</code> docs).
            </p>
          ) : null}
        </div>
      ) : null}

      {outlineEstimated ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-medium">Estimated outline:</span> Step times were inferred without a
          full video parse (e.g. title-only fallback). Review and edit before publishing.
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

        <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
          <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                videoSourceTab === "youtube"
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                  : "text-zinc-600 hover:bg-white/80"
              }`}
              onClick={() => {
                setVideoSourceTab("youtube");
                setChapterVideoUrl("");
              }}
            >
              YouTube Link
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                videoSourceTab === "upload"
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                  : "text-zinc-600 hover:bg-white/80"
              }`}
              onClick={() => {
                setVideoSourceTab("upload");
                setChapterVideoUrl("");
              }}
            >
              Upload Video
            </button>
          </div>

          {videoSourceTab === "youtube" ? (
            <>
              <label className="text-sm font-medium" htmlFor="chapter-youtube-url">
                YouTube URL (same video for all steps)
              </label>
              <input
                id="chapter-youtube-url"
                value={chapterVideoUrl}
                onChange={(e) => setChapterVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className="w-full"
              />
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-800">Upload source video</p>
              <label htmlFor="chapter-file-input" className="sr-only">
                Choose video file
              </label>
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    document.getElementById("chapter-file-input")?.click();
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void uploadChapterFile(f);
                }}
                className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                  dragActive
                    ? "border-orange-400 bg-orange-50/80"
                    : "border-zinc-300 bg-white hover:border-zinc-400"
                }`}
                onClick={() => document.getElementById("chapter-file-input")?.click()}
              >
                <p className="text-sm font-medium text-zinc-800">
                  {uploading ? "Uploading…" : "Drag & drop your video here"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  MP4, MOV, or AVI · max 500MB · stored securely (only you can access this file)
                </p>
                <input
                  id="chapter-file-input"
                  type="file"
                  accept=".mp4,.mov,.avi,video/mp4,video/quicktime,video/x-msvideo"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadChapterFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {uploadPreviewUrl ? (
                <div className="overflow-hidden rounded-lg border border-zinc-200 bg-black">
                  <video
                    src={uploadPreviewUrl}
                    className="max-h-[240px] w-full object-contain"
                    controls
                    playsInline
                    preload="metadata"
                  />
                </div>
              ) : null}
            </div>
          )}

          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-stretch gap-2">
              <button
                type="button"
                className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-sm font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  fullAutoLoading ||
                  descExtractLoading ||
                  materialsExtractLoading ||
                  !chapterVideoUrl.trim() ||
                  uploading ||
                  (videoSourceTab === "youtube" &&
                    !extractYouTubeVideoId(chapterVideoUrl.trim())) ||
                  (videoSourceTab === "upload" && !parseStorageVideoPath(chapterVideoUrl.trim()))
                }
                onClick={() => void runFullAutoFromVideo()}
              >
                {fullAutoLoading ? "Filling from video…" : "Fill from video (steps + materials)"}
              </button>
              <button
                type="button"
                className="btn-ghost shrink-0 text-sm"
                disabled={
                  fullAutoLoading ||
                  descExtractLoading ||
                  materialsExtractLoading ||
                  !chapterVideoUrl.trim() ||
                  uploading ||
                  (videoSourceTab === "youtube" &&
                    !extractYouTubeVideoId(chapterVideoUrl.trim())) ||
                  (videoSourceTab === "upload" && !parseStorageVideoPath(chapterVideoUrl.trim()))
                }
                onClick={() => void extractTimestampsFromYouTubeVideo()}
              >
                {descExtractLoading ? "Analyzing video…" : "✨ Steps only (timestamps)"}
              </button>
              <button
                type="button"
                className="btn-ghost shrink-0 text-sm"
                disabled={
                  fullAutoLoading ||
                  descExtractLoading ||
                  materialsExtractLoading ||
                  !chapterVideoUrl.trim() ||
                  uploading ||
                  (videoSourceTab === "youtube" &&
                    !extractYouTubeVideoId(chapterVideoUrl.trim())) ||
                  (videoSourceTab === "upload" && !parseStorageVideoPath(chapterVideoUrl.trim()))
                }
                onClick={() => void extractMaterialsFromTranscript()}
              >
                {materialsExtractLoading
                  ? "Extracting…"
                  : "✨ Materials & tools only"}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
              <span className="font-medium text-zinc-600">Fill from video:</span> Gemini watches the
              video (YouTube link or uploaded file) and fills steps, materials, and tools. The full-auto
              run also fills materials if they were still empty.{" "}
              <span className="font-medium text-zinc-600">Split buttons:</span> run one pass at a time.{" "}
              {videoSourceTab === "upload"
                ? "Uploads: analyze file directly; ~80MB server limit."
                : ""}
            </p>
          </div>
        </div>

        <details className="group rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-zinc-700 marker:text-zinc-400">
            Advanced: paste JSON (e.g. from ChatGPT in another tab)
          </summary>
          <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3">
            <p className="text-xs text-zinc-600">
              Optional <code className="rounded bg-zinc-100 px-1">materials</code>,{" "}
              <code className="rounded bg-zinc-100 px-1">tools</code>,{" "}
              <code className="rounded bg-zinc-100 px-1">steps</code> (
              <code className="rounded bg-zinc-100 px-1">step_name</code>, times,{" "}
              <code className="rounded bg-zinc-100 px-1">description</code>).
            </p>
            <textarea
              value={pasteImportText}
              onChange={(e) => setPasteImportText(e.target.value)}
              rows={4}
              placeholder={`{\n  "materials": "…",\n  "tools": "…",\n  "steps": [ … ]\n}`}
              className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400"
            />
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={!pasteImportText.trim()}
              onClick={applyPasteImport}
            >
              Apply pasted JSON
            </button>
          </div>
        </details>

        <div
          id="materials-tools"
          className="space-y-3 rounded-lg border border-orange-200/90 bg-gradient-to-b from-orange-50/80 to-amber-50/40 p-4 shadow-sm ring-1 ring-orange-100"
        >
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Materials & Tools
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              List everything your viewer needs before they start
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-900" htmlFor="materials-text">
              Materials
            </label>
            <textarea
              id="materials-text"
              rows={4}
              value={materialsText}
              onChange={(e) => setMaterialsText(e.target.value)}
              placeholder="e.g. Bulky weight yarn in grey and white, fiberfill stuffing, safety eyes 10mm"
              className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-900" htmlFor="tools-text">
              Tools
            </label>
            <textarea
              id="tools-text"
              rows={3}
              value={toolsText}
              onChange={(e) => setToolsText(e.target.value)}
              placeholder="e.g. 5.0mm crochet hook, yarn needle, scissors"
              className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
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
                    <label className="text-xs text-zinc-600" htmlFor={`step-name-${row.id}`}>
                      Step name
                    </label>
                    <input
                      id={`step-name-${row.id}`}
                      value={row.step_name}
                      onChange={(e) => updateStep(row.id, { step_name: e.target.value })}
                      placeholder="Short label for this segment"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs text-zinc-600" htmlFor={`step-desc-${row.id}`}>
                      Description
                    </label>
                    <textarea
                      id={`step-desc-${row.id}`}
                      rows={4}
                      value={row.description}
                      onChange={(e) => updateStep(row.id, { description: e.target.value })}
                      placeholder="Optional — type your own, or leave empty and use “Generate with AI” below."
                      className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
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

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={aiLoading}
            onClick={onGenerateAi}
          >
            {aiLoading ? "Generating…" : "Generate with AI"}
          </button>
          <span className="text-xs text-zinc-500">
            Fills only steps with an empty description; you can edit any text afterward.
          </span>
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
