import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  detectVideoKind,
  extractVimeoVideoId,
  extractYouTubeVideoId
} from "@/lib/video";
import { VimeoPlayerClient, YouTubePlayerClient } from "@/app/play/[id]/player";

export const dynamic = "force-dynamic";

type SkuNested = { name: string; is_active: boolean };

type StepWithSku = {
  id: string;
  step_name: string;
  description: string;
  youtube_url: string;
  start_time: number;
  end_time: number;
  skus: SkuNested | SkuNested[] | null;
};

export default async function PlayPage({ params }: { params: { id: string } }) {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("steps")
    .select("id,step_name,description,youtube_url,start_time,end_time, skus ( name, is_active )")
    .eq("id", params.id)
    .maybeSingle();

  const step = row as StepWithSku | null;

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

  return (
    <main className="container-page py-6 md:py-10">
      <div className="space-y-4">
        <div className="card p-6">
          {sku?.name ? (
            <div className="text-xs text-zinc-500">
              Tutorial · <span className="text-zinc-700">{sku.name}</span>
            </div>
          ) : null}
          <div className="mt-1 text-xs text-zinc-500">Step</div>
          <div className="mt-1 text-xl font-semibold tracking-tight">{step.step_name}</div>
          {step.description ? (
            <div className="mt-3 whitespace-pre-wrap text-sm text-zinc-600">{step.description}</div>
          ) : null}
          <div className="mt-4 text-xs text-zinc-500">
            Clip: {step.start_time}s → {step.end_time}s
          </div>
        </div>

        {showYoutube && youtubeId ? (
          <YouTubePlayerClient
            playbackId={step.id}
            videoId={youtubeId}
            startTime={step.start_time}
            endTime={step.end_time}
          />
        ) : null}

        {showVimeo && vimeoId ? (
          <VimeoPlayerClient
            playbackId={step.id}
            vimeoId={vimeoId}
            startTime={step.start_time}
            endTime={step.end_time}
          />
        ) : null}

        {!showYoutube && !showVimeo ? (
          <div className="card p-6">
            <div className="text-sm font-medium">Unsupported or invalid video URL</div>
            <div className="mt-1 text-sm text-zinc-600">
              Use a standard YouTube or Vimeo link for this step. Contact the author if this persists.
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
