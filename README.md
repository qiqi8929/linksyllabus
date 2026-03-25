# LinkSyllabus (Next.js 14 + Tailwind + Supabase + Stripe)

干净简洁、Notion 风白色界面，主色 `#E8956D`。核心功能：

- Supabase Auth（邮箱 + 密码）注册/登录
- Dashboard 创建 Tutorial SKU（name/youtube_url/start/end/description）
- 每个 SKU 自动生成 QR（指向 `/play/[id]`），可下载 PNG
- `/play/[id]`：YouTube IFrame 播放片段，到 end_time 自动暂停；结束后全屏“回到教材”提示（重播/暂停/完成）
- Stripe Checkout：SKU 一次性 $19 激活；订阅 $19.9/月（用于记录用户订阅状态）
- Supabase 数据库：`users`、`skus`、`subscriptions`

## 1) 本地启动

先确保你电脑装了 **Node.js LTS**（装完要重启终端，让 `node`/`npm` 生效）。

```bash
cd LinkSyllabus
cp .env.example .env.local
npm i
npm run dev
```

打开 `http://localhost:3000`

## 2) Supabase 数据库

在 Supabase SQL Editor 执行 `supabase/schema.sql`。

然后在 Supabase Project Settings → API 里把：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

填到 `.env.local`。

## 3) Stripe 配置

在 Stripe Dashboard 创建：

- 一个 **Product + Price（one-time）**：$19 USD（SKU 激活）
- 一个 **Product + Price（recurring monthly）**：$19.9/月（订阅）

把 price id 填到 `src/lib/stripe/prices.ts`。

配置 Webhook（监听 `checkout.session.completed`）指向：

- `POST /api/stripe/webhook`

并把：

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

填到 `.env.local`。

## 4) 部署到 Vercel

1. 把 `LinkSyllabus/` 推到 GitHub（或单独建一个仓库）
2. Vercel → New Project → 选择仓库
3. Root Directory 选 `LinkSyllabus`
4. Environment Variables 填入 `.env.example` 里的所有项
5. Deploy

部署完成后把 `NEXT_PUBLIC_APP_URL` 改成你的 Vercel 域名（例如 `https://xxx.vercel.app`），并在 Stripe Webhook endpoint 里更新 URL。

