import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type StepRow = {
  id: string;
  step_number: number;
  step_name: string;
  scan_count: number;
};

type SkuRow = {
  id: string;
  name: string;
  steps: StepRow[] | null;
};

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: rawSkus } = await supabase
    .from("skus")
    .select("id,name,steps(id,step_number,step_name,scan_count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const skus = (rawSkus ?? []) as SkuRow[];

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="text-sm text-zinc-600">使用说明</div>
        <div className="mt-1 text-sm text-zinc-700">
          每个教程下可添加多个<strong>步骤</strong>；每步有独立二维码，扫码进入{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">/play/[步骤ID]</code>，只播放该步对应片段。
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">你的教程（SKU）</h2>
          <div className="mt-1 text-sm text-zinc-600">展开查看步骤、扫码次数与 QR</div>
        </div>
        <Link className="btn-primary" href="/dashboard/new">
          Add New Tutorial
        </Link>
      </div>

      <div className="grid gap-4">
        {skus.length === 0 ? (
          <div className="card p-6 text-sm text-zinc-600">
            还没有教程。点击 <span className="font-medium">Add New Tutorial</span> 创建后，再为教程添加步骤。
          </div>
        ) : null}

        {skus.map((sku) => {
          const steps = [...(sku.steps ?? [])].sort((a, b) => a.step_number - b.step_number);
          return (
            <div key={sku.id} className="card overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-zinc-100 p-5 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="text-base font-semibold">{sku.name}</div>
                  <div className="mt-1 text-sm text-zinc-500">{steps.length} 个步骤</div>
                </div>
                <Link className="btn-primary shrink-0" href={`/dashboard/skus/${sku.id}/steps/new`}>
                  添加步骤
                </Link>
              </div>

              {steps.length === 0 ? (
                <div className="px-5 py-4 text-sm text-zinc-600">
                  暂无步骤。点击「添加步骤」填写该步的名称、描述、YouTube 与起止秒数。
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {steps.map((st) => (
                    <li key={st.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          <span className="text-zinc-400">#{st.step_number}</span> {st.step_name}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          扫码 {st.scan_count} 次 ·{" "}
                          <Link className="text-brand hover:underline" href={`/play/${st.id}`}>
                            /play/{st.id}
                          </Link>
                        </div>
                      </div>
                      <a className="btn-ghost shrink-0 text-sm" href={`/api/qr/${st.id}?download=1`}>
                        下载本步 QR PNG
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
