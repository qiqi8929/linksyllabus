import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { extractMaterialsAndToolsFromYouTube } from "@/lib/gemini";
import {
  isMaterialsToolsStepTitle,
  splitDescriptionIntoMaterialsAndTools
} from "@/lib/materialsToolsDisplay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractYouTubeVideoId } from "@/lib/video";
import { TutorialViewClient, type TutorialStepPayload } from "./TutorialViewClient";
import {
  fetchSkuVisibleToViewer,
  fetchTutorialSteps,
  isPublicDemoSkuId
} from "./tutorialAccess";

export const dynamic = "force-dynamic";

type PageParams = { skuId: string };

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

async function resolveParams(
  params: PageParams | Promise<PageParams>
): Promise<PageParams> {
  return Promise.resolve(params);
}

function parseStepParam(sp: Record<string, string | string[] | undefined>) {
  const raw = sp.step;
  const stepStr = Array.isArray(raw) ? raw[0] : raw;
  const n = stepStr != null ? parseInt(String(stepStr), 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return undefined;
  return n;
}

function readSkuTextField(sku: unknown, key: string): string | null {
  if (sku == null || typeof sku !== "object") return null;
  const r = sku as Record<string, unknown>;
  const camel =
    key === "materials_text"
      ? "materialsText"
      : key === "tools_text"
        ? "toolsText"
        : null;
  const v = r[key] ?? (camel ? r[camel] : undefined);
  if (v == null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

export async function generateMetadata({
  params
}: {
  params: PageParams | Promise<PageParams>;
}): Promise<Metadata> {
  const { skuId } = await resolveParams(params);
  const { sku } = await fetchSkuVisibleToViewer(skuId);

  const title = sku?.name?.trim()
    ? `${sku.name} · Tutorial`
    : "Tutorial · LinkSyllabus";

  return { title, description: "Step-by-step tutorial with video clips." };
}

export default async function TutorialPage({
  params,
  searchParams
}: {
  params: PageParams | Promise<PageParams>;
  searchParams?: SearchParamsInput;
}) {
  const { skuId } = await resolveParams(params);
  const sp = await Promise.resolve(searchParams ?? {});
  const initialStepNumber = parseStepParam(sp);

  const { supabase, sku } = await fetchSkuVisibleToViewer(skuId);

  if (!sku) {
    notFound();
  }

  const { data: stepRows, error: stepsErr } = await fetchTutorialSteps(
    sku.id,
    sku
  );

  if (stepsErr) {
    notFound();
  }

  const steps: TutorialStepPayload[] = (stepRows ?? []).map((s) => ({
    id: s.id,
    step_number: s.step_number,
    step_name: s.step_name,
    description: s.description ?? "",
    youtube_url: s.youtube_url,
    start_time: s.start_time,
    end_time: s.end_time
  }));

  let materialsText = readSkuTextField(sku, "materials_text");
  let toolsText = readSkuTextField(sku, "tools_text");
  if (!materialsText?.trim() && !toolsText?.trim()) {
    const { data: mtRow } = await supabase
      .from("skus")
      .select("materials_text, tools_text")
      .eq("id", sku.id)
      .maybeSingle();
    if (mtRow) {
      materialsText = readSkuTextField(mtRow, "materials_text");
      toolsText = readSkuTextField(mtRow, "tools_text");
    }
  }
  if (!materialsText?.trim() && !toolsText?.trim()) {
    try {
      const admin = createSupabaseAdminClient();
      const { data: adminRow } = await admin
        .from("skus")
        .select("materials_text, tools_text")
        .eq("id", sku.id)
        .maybeSingle();
      if (adminRow) {
        materialsText = readSkuTextField(adminRow, "materials_text");
        toolsText = readSkuTextField(adminRow, "tools_text");
      }
    } catch {
      /* ignore — e.g. missing service role locally */
    }
  }

  if (!materialsText?.trim() && !toolsText?.trim() && steps.length > 0) {
    const chapterUrl = steps[0]?.youtube_url?.trim();
    if (chapterUrl && extractYouTubeVideoId(chapterUrl) && env.geminiApiKey()) {
      try {
        const { materials, tools } =
          await extractMaterialsAndToolsFromYouTube(chapterUrl);
        const m = String(materials ?? "").trim();
        const t = String(tools ?? "").trim();
        if (m || t) {
          materialsText = m || null;
          toolsText = t || null;
          try {
            const admin = createSupabaseAdminClient();
            await admin
              .from("skus")
              .update({
                materials_text: m || null,
                tools_text: t || null
              })
              .eq("id", sku.id);
          } catch {
            /* still show this response even if persist fails */
          }
        }
      } catch {
        /* no captions / Gemini error — leave empty */
      }
    }
  }

  let stepsForViewer = steps;
  if (!materialsText?.trim() && !toolsText?.trim() && steps.length > 0) {
    const matIdx = steps.findIndex((s) => isMaterialsToolsStepTitle(s.step_name));
    if (matIdx >= 0) {
      const split = splitDescriptionIntoMaterialsAndTools(
        steps[matIdx].description ?? ""
      );
      const m = split.materialsText.trim();
      const t = split.toolsText.trim();
      if (m || t) {
        materialsText = m || null;
        toolsText = t || null;
        const rest = steps.filter((_, i) => i !== matIdx);
        if (rest.length > 0) {
          stepsForViewer = rest;
        }
      }
    }
  }

  return (
    <main className="container-page py-8 md:py-12">
      {!sku.is_active && !isPublicDemoSkuId(skuId) ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-medium">Preview</span> — This tutorial is not published yet.
          After payment completes, anyone with the link can open it.
        </div>
      ) : null}
      <div className="mb-8 flex flex-col gap-4 border-b border-zinc-100 pb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Tutorial
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
            {sku.name}
          </h1>
          {sku.description?.trim() ? (
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-600">
              {sku.description}
            </p>
          ) : null}
        </div>
        <a
          href={`/tutorial/${encodeURIComponent(sku.id)}/print`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center justify-center gap-2 self-stretch rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 sm:self-auto"
        >
          🖨️ Print QR Guide
        </a>
      </div>

      {steps.length === 0 ? (
        <div className="card p-8 text-center text-sm text-zinc-600">
          No steps published yet.
        </div>
      ) : (
        <TutorialViewClient
          skuId={sku.id}
          steps={stepsForViewer}
          initialStepNumber={initialStepNumber}
          materialsText={materialsText}
          toolsText={toolsText}
          printHref={`/tutorial/${encodeURIComponent(sku.id)}/print`}
        />
      )}

      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center">
        <Link className="text-sm text-zinc-500 hover:text-zinc-800" href="/">
          Home
        </Link>
      </div>
    </main>
  );
}
