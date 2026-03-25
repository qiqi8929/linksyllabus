import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createStepAction } from "@/app/dashboard/serverActions";

export default async function NewStepPage({ params }: { params: { skuId: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sku } = await supabase
    .from("skus")
    .select("id,name")
    .eq("id", params.skuId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sku) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">添加步骤</h1>
          <div className="mt-1 text-sm text-zinc-600">
            教程：<span className="font-medium text-zinc-800">{sku.name}</span>
          </div>
        </div>
        <Link className="btn-ghost" href="/dashboard">
          返回 Dashboard
        </Link>
      </div>

      <form action={createStepAction} className="card space-y-4 p-6">
        <input type="hidden" name="sku_id" value={sku.id} />

        <div className="space-y-1">
          <div className="text-sm font-medium">步骤名称</div>
          <input name="step_name" required placeholder="例如：第 1 步 — 打开官网" />
        </div>

        <div className="space-y-1">
          <div className="text-sm font-medium">步骤描述</div>
          <textarea name="description" rows={4} placeholder="本步文字说明…" />
        </div>

        <div className="space-y-1">
          <div className="text-sm font-medium">YouTube 视频链接</div>
          <input name="youtube_url" required placeholder="https://www.youtube.com/watch?v=..." />
          <div className="text-xs text-zinc-500">支持常见 watch / youtu.be 链接。</div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <div className="text-sm font-medium">开始时间（秒）</div>
            <input name="start_time" type="number" min={0} defaultValue={0} required />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">结束时间（秒）</div>
            <input name="end_time" type="number" min={1} defaultValue={30} required />
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn-primary" type="submit">
            保存步骤
          </button>
          <Link className="btn-ghost" href="/dashboard">
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
