import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container-page py-10">
      <div className="card p-6 md:p-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs">
              <span className="h-2 w-2 rounded-full bg-brand" />
              Notion 风教程二维码
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">LinkSyllabus</h1>
            <p className="max-w-xl text-sm text-zinc-600">
              为每个教程添加多个步骤；每步独立二维码，扫码进入播放页，只播放该步的起止秒数片段，结束后显示「回到教材」。
            </p>
          </div>
          <div className="flex gap-2">
            <Link className="btn-ghost" href="/login">
              登录
            </Link>
            <Link className="btn-primary" href="/signup">
              注册
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="text-sm font-medium">1) 创建教程并添加步骤</div>
            <div className="mt-1 text-sm text-zinc-600">教程只填名称与说明；每步单独填名称、描述、YouTube、起止秒数。</div>
          </div>
          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="text-sm font-medium">2) 每步独立 QR</div>
            <div className="mt-1 text-sm text-zinc-600">指向 `/play/[步骤ID]`，可下载 PNG。</div>
          </div>
          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="text-sm font-medium">3) 片段播放控制</div>
            <div className="mt-1 text-sm text-zinc-600">每 100ms 检查时间，到结束秒数立刻暂停。</div>
          </div>
        </div>
      </div>
    </main>
  );
}

