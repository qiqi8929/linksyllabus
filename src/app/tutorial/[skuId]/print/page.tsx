import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchSkuVisibleToViewer } from "../tutorialAccess";
import { PrintBar } from "./PrintBar";

export const dynamic = "force-dynamic";

type PageParams = { skuId: string };

async function resolveParams(
  params: PageParams | Promise<PageParams>
): Promise<PageParams> {
  return Promise.resolve(params);
}

export async function generateMetadata({
  params
}: {
  params: PageParams | Promise<PageParams>;
}): Promise<Metadata> {
  const { skuId } = await resolveParams(params);
  const { sku } = await fetchSkuVisibleToViewer(skuId);
  const title = sku?.name?.trim()
    ? `${sku.name} · Print manual`
    : "Print manual · LinkSyllabus";
  return {
    title,
    description: "Printable manual with QR codes to open each step’s video."
  };
}

export default async function TutorialPrintPage({
  params
}: {
  params: PageParams | Promise<PageParams>;
}) {
  const { skuId } = await resolveParams(params);
  const { supabase, sku } = await fetchSkuVisibleToViewer(skuId);

  if (!sku) {
    notFound();
  }

  const { data: stepRows, error: stepsErr } = await supabase
    .from("steps")
    .select("id,step_number,step_name,description")
    .eq("sku_id", sku.id)
    .order("step_number", { ascending: true });

  if (stepsErr) {
    notFound();
  }

  const steps = stepRows ?? [];

  return (
    <main className="container-page max-w-3xl py-8 md:py-12 print:max-w-none print:py-4">
      <style>{`
        @media print {
          @page { margin: 12mm; }
          .qr-print-img {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <nav className="mb-6 print:hidden">
        <Link
          href={`/tutorial/${encodeURIComponent(sku.id)}`}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Back to interactive tutorial
        </Link>
      </nav>

      <PrintBar />

      <header className="mb-10 border-b border-zinc-200 pb-6 print:mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Print manual
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
          {sku.name}
        </h1>
        {sku.description?.trim() ? (
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">{sku.description}</p>
        ) : null}
        <p className="mt-4 text-sm text-zinc-600">
          Scan the QR code for each step to open the step video on your phone
          (same clip as the interactive tutorial). Codes use a short link for
          reliable scanning.
        </p>
      </header>

      {steps.length === 0 ? (
        <p className="text-sm text-zinc-600">No steps to print yet.</p>
      ) : (
        <ol className="list-none space-y-0 p-0">
          {steps.map((s) => (
            <li
              key={s.id}
              className="break-inside-avoid border-b border-zinc-200 py-8 last:border-b-0 print:py-6"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
                <div className="shrink-0 md:w-44">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                    Step {s.step_number}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/qr/${encodeURIComponent(s.id)}`}
                    alt=""
                    width={256}
                    height={256}
                    className="qr-print-img mt-2 h-52 w-52 rounded-lg border-2 border-zinc-200 bg-white p-2 object-contain md:h-56 md:w-56 print:h-72 print:w-72 print:border-zinc-300"
                  />
                  <p className="mt-2 text-center text-[10px] text-zinc-500">
                    Scan to watch this step
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    {s.step_name}
                  </h2>
                  {s.description?.trim() ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                      {s.description}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm italic text-zinc-400">
                      No written description for this step.
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
