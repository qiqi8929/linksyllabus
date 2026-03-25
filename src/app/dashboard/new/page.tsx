import Link from "next/link";
import { createSkuAction } from "@/app/dashboard/serverActions";

export default function NewSkuPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Add New Tutorial</h1>
          <div className="mt-1 text-sm text-zinc-600">
            先创建教程（SKU），再在 Dashboard 里为该教程添加多个步骤；每步有独立二维码与播放页。
          </div>
        </div>
        <Link className="btn-ghost" href="/dashboard">
          返回
        </Link>
      </div>

      <form action={createSkuAction} className="card space-y-4 p-6">
        <div className="space-y-1">
          <div className="text-sm font-medium">教程名称</div>
          <input name="name" required placeholder="例如：DS-160 填写指南" />
        </div>

        <div className="space-y-1">
          <div className="text-sm font-medium">教程说明（可选）</div>
          <textarea name="description" rows={4} placeholder="对整个教程的简要说明…" />
        </div>

        <div className="flex gap-2">
          <button className="btn-primary" type="submit">
            创建
          </button>
          <Link className="btn-ghost" href="/dashboard">
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
