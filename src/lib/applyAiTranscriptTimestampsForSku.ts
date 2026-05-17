import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { inferTutorialStepClipsFromTranscript } from "@/lib/gemini";
import { fillMissingStepClipsAfterAi } from "@/lib/stepTimestamp";
import { getTranscriptWithFallbacks, type TranscriptCue } from "@/lib/transcript";
import { extractYouTubeVideoId } from "@/lib/video";

const TRANSCRIPT_PROMPT_MAX_CHARS = 95_000;

function buildTranscriptDocument(cues: TranscriptCue[]): string {
  const lines: string[] = [];
  let total = 0;
  let truncated = false;
  for (const c of cues) {
    const t = Math.max(0, Math.floor(c.start));
    const line = `[${t}s] ${String(c.text).replace(/\s+/g, " ").trim()}`;
    if (!line.trim() || line === `[${t}s]`) continue;
    const add = line.length + 1;
    if (total + add > TRANSCRIPT_PROMPT_MAX_CHARS) {
      truncated = true;
      break;
    }
    lines.push(line);
    total += add;
  }
  const body = lines.join("\n");
  if (truncated) {
    return (
      "(Transcript truncated for model context; prefer timings supported by the earlier portion when unsure.)\n" +
      body
    );
  }
  return body;
}

type StepRow = {
  id: string;
  step_number: number;
  step_name: string;
  description: string;
  youtube_url: string;
  start_time: number;
  end_time: number;
  timestamp_source: string | null;
};

/**
 * After a SKU is created, fills unset steps (start/end both 0) using YouTube transcript + Gemini.
 * Skips non-YouTube URLs, missing transcript, or steps marked manual/chapter.
 */
export async function applyAiTranscriptTimestampsForSku(
  supabase: SupabaseClient,
  params: { skuId: string; userId: string }
): Promise<{ updated: number; skippedReason?: string }> {
  if (!env.geminiApiKey()) {
    return { updated: 0, skippedReason: "no_gemini_key" };
  }

  const { skuId, userId } = params;
  const { data: sku, error: skuErr } = await supabase
    .from("skus")
    .select("id,user_id")
    .eq("id", skuId)
    .maybeSingle();

  if (skuErr || !sku || sku.user_id !== userId) {
    return { updated: 0, skippedReason: "sku_not_found" };
  }

  const { data: steps, error: stepErr } = await supabase
    .from("steps")
    .select("id,step_number,step_name,description,youtube_url,start_time,end_time,timestamp_source")
    .eq("sku_id", skuId)
    .order("step_number", { ascending: true });

  if (stepErr || !steps?.length) {
    console.error("[applyAiTranscriptTimestampsForSku] steps load failed", stepErr);
    return { updated: 0, skippedReason: "steps_load_failed" };
  }

  const rows = steps as StepRow[];
  const eligible = rows.filter(
    (r) =>
      Number(r.start_time) === 0 &&
      Number(r.end_time) === 0 &&
      r.timestamp_source !== "manual" &&
      r.timestamp_source !== "chapter"
  );

  if (!eligible.length) {
    return { updated: 0, skippedReason: "no_eligible_steps" };
  }

  const byVideo = new Map<string, StepRow[]>();
  for (const st of eligible) {
    const vid = extractYouTubeVideoId(String(st.youtube_url ?? ""));
    if (!vid) continue;
    const list = byVideo.get(vid) ?? [];
    list.push(st);
    byVideo.set(vid, list);
  }

  let updated = 0;
  for (const [videoId, group] of byVideo) {
    group.sort((a, b) => a.step_number - b.step_number);
    const t = await getTranscriptWithFallbacks(videoId);
    if (!t?.cues?.length) {
      continue;
    }
    const transcriptText = buildTranscriptDocument(t.cues);
    const clipsRaw = await inferTutorialStepClipsFromTranscript({
      videoId,
      transcriptText,
      steps: group.map((s) => ({
        step_number: s.step_number,
        step_name: s.step_name,
        description: s.description
      }))
    });

    const lastCueStart = t.cues.reduce((max, c) => Math.max(max, Math.floor(c.start)), 0);
    const lastCueText = t.cues[t.cues.length - 1];
    const lastCueDur = lastCueText
      ? Math.max(30, Math.ceil((lastCueText.start + (lastCueText.duration ?? 8)) as number))
      : 0;
    const videoDurationSec = Math.max(lastCueStart + 30, lastCueDur);

    const clips = fillMissingStepClipsAfterAi({
      steps: group,
      clips: clipsRaw,
      videoDurationSec
    });

    for (const s of group) {
      const clip = clips.get(s.step_number);
      if (!clip) continue;
      const start_time = Math.max(0, Math.floor(clip.start_time));
      const end_time = Math.max(start_time + 15, Math.floor(clip.end_time));

      const { error: upErr } = await supabase
        .from("steps")
        .update({
          start_time,
          end_time,
          timestamp_source: "ai"
        })
        .eq("id", s.id)
        .eq("sku_id", skuId);

      if (upErr) {
        console.error("[applyAiTranscriptTimestampsForSku] step update failed", upErr);
        continue;
      }
      updated++;
    }
  }

  return { updated };
}
