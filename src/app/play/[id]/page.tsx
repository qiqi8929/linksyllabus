import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { PlayerClient } from "@/app/play/[id]/player";

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
          <div className="text-lg font-semibold">未找到</div>
          <div className="mt-1 text-sm text-zinc-600">该步骤不存在或已删除。</div>
          <div className="mt-4">
            <Link className="btn-ghost" href="/">
              返回首页
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const sku = Array.isArray(step.skus) ? step.skus[0] : step.skus;

  const videoId = extractYouTubeVideoId(step.youtube_url);

  return (
    <main className="container-page py-6 md:py-10">
      <div className="space-y-4">
        <div className="card p-6">
          {sku?.name ? (
            <div className="text-xs text-zinc-500">
              教程 · <span className="text-zinc-700">{sku.name}</span>
            </div>
          ) : null}
          <div className="mt-1 text-xs text-zinc-500">步骤</div>
          <div className="mt-1 text-xl font-semibold tracking-tight">{step.step_name}</div>
          {step.description ? (
            <div className="mt-3 whitespace-pre-wrap text-sm text-zinc-600">{step.description}</div>
          ) : null}
          <div className="mt-4 text-xs text-zinc-500">
            片段：{step.start_time}s → {step.end_time}s
          </div>
        </div>

        {videoId ? (
          <PlayerClient
            playbackId={step.id}
            videoId={videoId}
            startTime={step.start_time}
            endTime={step.end_time}
          />
        ) : (
          <div className="card p-6">
            <div className="text-sm font-medium">YouTube 链接无效</div>
            <div className="mt-1 text-sm text-zinc-600">请联系发布者检查该步骤的视频链接。</div>
          </div>
        )}
      </div>
    </main>
  );
}
