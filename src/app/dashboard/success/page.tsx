import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

type Search = { skuId?: string; checkout?: string };

export default async function DashboardSuccessPage({
  searchParams
}: {
  searchParams: Search | Promise<Search>;
}) {
  const sp = (await Promise.resolve(searchParams)) ?? {};
  const skuId = sp.skuId;
  if (!skuId) {
    redirect("/dashboard");
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: sku } = await supabase
    .from("skus")
    .select("id,name,is_active")
    .eq("id", skuId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sku) {
    return (
      <div className="card p-6 space-y-4">
        <p className="text-sm text-zinc-700">Tutorial not found.</p>
        <Link className="btn-ghost inline-block" href="/dashboard">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { data: steps } = await supabase
    .from("steps")
    .select("id,step_number,step_name")
    .eq("sku_id", skuId)
    .order("step_number", { ascending: true });

  const appUrl = env.appUrl();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tutorial ready</h1>
        <p className="mt-1 text-sm text-zinc-600">{sku.name}</p>
        {!sku.is_active ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Payment is still confirming. Refresh in a few seconds if links or scans fail.
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {(steps ?? []).map((st) => (
          <div key={st.id} className="card overflow-hidden p-4">
            <div className="text-sm font-medium">
              <span className="text-zinc-400">#{st.step_number}</span> {st.step_name}
            </div>
            <div className="mt-3 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/qr/${st.id}`}
                alt={`QR for step ${st.step_number}`}
                className="h-40 w-40"
              />
            </div>
            <a
              className="btn-ghost mt-3 block text-center text-sm"
              href={`/api/qr/${st.id}?download=1`}
            >
              Download PNG
            </a>
            <div className="mt-2 text-center text-xs text-zinc-500 break-all">
              {appUrl}/play/{st.id}
            </div>
          </div>
        ))}
      </div>

      <Link className="btn-primary inline-block" href="/dashboard">
        Back to dashboard
      </Link>
    </div>
  );
}
