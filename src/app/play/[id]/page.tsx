import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  detectVideoKind,
  extractVimeoVideoId,
  extractYouTubeVideoId
} from "@/lib/video";
import {
  CloudflareStreamClipPlayer,
  StorageVideoClipPlayer,
  VimeoPlayerClient,
  YouTubePlayerClient
} from "@/app/play/[id]/player";
import { resolvePlaybackClipForStep } from "@/lib/stepTimestamp";

export const dynamic = "force-dynamic";

type SkuNested = { name: string; is_active: boolean };

type StepWithSku = {
  id: string;
  step_number: number;
  step_name: string;
  description: string;
  youtube_url: string;
  start_time: number;
  end_time: number;
  sku_id: string;
  skus: SkuNested | SkuNested[] | null;
};

export default async function PlayPage({ params }: { params: { id: string } }) {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("steps")
    .select(
      "id,step_number,step_name,description,youtube_url,start_time,end_time,sku_id, skus ( name, is_active )"
    )
    .eq("id", params.id)
    .maybeSingle();

  const step = row as StepWithSku | null;

  const { data: siblingRows } = step
    ? await admin
        .from("steps")
        .select("step_number,start_time,end_time")
        .eq("sku_id", step.sku_id)
        .order("step_number", { ascending: true })
    : { data: null };

  if (!step) {
    return (
      <main className="container-page py-10">
        <div className="card p-6">
          <div className="text-lg font-semibold">Not found</div>
          <div className="mt-1 text-sm text-zinc-600">This step does not exist or was removed.</div>
          <div className="mt-4">
            <Link className="btn-ghost" href="/">
              Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const sku = Array.isArray(step.skus) ? step.skus[0] : step.skus;

  const kind = detectVideoKind(step.youtube_url);
  const youtubeId = extractYouTubeVideoId(step.youtube_url);
  const vimeoId = extractVimeoVideoId(step.youtube_url);
  const showYoutube = kind === "youtube" && Boolean(youtubeId);
  const showVimeo = kind === "vimeo" && Boolean(vimeoId);
  const showStorage = kind === "storage";
  const showStream = kind === "stream";

  const siblings =
    (siblingRows as Array<{
      step_number: number;
      start_time: number;
      end_time: number;
    }> | null) ?? [];
  const { startTime, endTime } = resolvePlaybackClipForStep(step, siblings);

  return (
    <main className="container-page py-6 md:py-10">
      <div className="space-y-4">
        <div className="card p-6">
          {sku?.name ? (
            <div className="text-xs text-zinc-500">
              Tutorial · <span className="text-zinc-700">{sku.name}</span>
            </div>
          ) : null}
          <div className="mt-1 text-xs text-zinc-500">
            Step {step.step_number}
          </div>
          <div className="mt-1 text-xl font-semibold tracking-tight">{step.step_name}</div>
          {step.description ? (
            <div className="mt-3 whitespace-pre-wrap text-sm text-zinc-600">{step.description}</div>
          ) : null}
          <div className="mt-4 text-xs text-zinc-500">
            Clip: {startTime}s
            {endTime != null ? ` → ${endTime}s` : " → (end of video)"}
          </div>
        </div>

        {showYoutube && youtubeId ? (
          <YouTubePlayerClient
            playbackId={step.id}
            videoId={youtubeId}
            startTime={startTime}
            endTime={endTime}
            skuId={step.sku_id}
            stepNumber={step.step_number}
          />
        ) : null}

        {showVimeo && vimeoId ? (
          <VimeoPlayerClient
            playbackId={step.id}
            vimeoId={vimeoId}
            startTime={startTime}
            endTime={endTime}
            skuId={step.sku_id}
            stepNumber={step.step_number}
          />
        ) : null}

        {showStorage ? (
          <div className="card aspect-video overflow-hidden rounded-xl border border-zinc-200 bg-black p-0">
            <StorageVideoClipPlayer
              stepId={step.id}
              startTime={startTime}
              endTime={endTime}
            />
          </div>
        ) : null}

        {showStream ? (
          <div className="card aspect-video overflow-hidden rounded-xl border border-zinc-200 bg-black p-0">
            <CloudflareStreamClipPlayer stepId={step.id} />
          </div>
        ) : null}

        {!showYoutube && !showVimeo && !showStorage && !showStream ? (
          <div className="card p-6">
            <div className="text-sm font-medium">Unsupported or invalid video URL</div>
            <div className="mt-1 text-sm text-zinc-600">
              Use a standard YouTube or Vimeo link, or an uploaded video, for this step. Contact the
              author if this persists.
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
