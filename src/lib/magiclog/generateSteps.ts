import { generateContentWithYouTubeWatchUrl } from "@/lib/geminiVideoFileApi";
import { env } from "@/lib/env";
import { getTranscriptWithFallbacks } from "@/lib/transcript";
import { extractYouTubeVideoId } from "@/lib/video";
import type { MagicLogAiStep } from "@/lib/magiclog/types";

function parseStepsJson(raw: string): MagicLogAiStep[] {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*\r?\n?/i, "");
  s = s.replace(/\r?\n?```\s*$/i, "");
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);

  const arr = JSON.parse(s) as unknown[];
  if (!Array.isArray(arr)) throw new Error("Expected JSON array of steps");

  const out: MagicLogAiStep[] = [];
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i] as Record<string, unknown>;
    const step_number = Math.floor(Number(o.step_number ?? i + 1));
    const title = String(o.title ?? o.step_name ?? "").trim();
    const description = String(o.description ?? "").trim();
    if (!title) continue;
    out.push({
      step_number,
      title,
      description: description || title
    });
  }
  return out.slice(0, 8);
}

export async function generateMagicLogSteps(params: {
  taskName: string;
  trade: string;
  youtubeUrl?: string;
}): Promise<MagicLogAiStep[]> {
  if (!env.geminiApiKey()) {
    throw new Error("AI is not configured (missing GEMINI_API_KEY).");
  }

  const { taskName, trade, youtubeUrl } = params;
  let transcriptHint = "";

  const videoId = youtubeUrl ? extractYouTubeVideoId(youtubeUrl) : null;
  if (videoId) {
    const t = await getTranscriptWithFallbacks(videoId);
    if (t?.cues?.length) {
      transcriptHint = t.cues
        .slice(0, 120)
        .map((c) => `[${Math.floor(c.start)}s] ${c.text}`)
        .join("\n");
    }
  }

  const prompt = `You are training a Canadian trades apprentice (${trade}).

Task: "${taskName}"

Generate 5-8 clear, practical step-by-step instructions for completing this task safely and to trade standards.
${transcriptHint ? `\nVideo transcript excerpt:\n${transcriptHint}\n` : ""}

Return ONLY a JSON array (no markdown), each item:
{"step_number":1,"title":"Short step title","description":"1-3 sentences of instruction"}

Use step_number 1, 2, 3... in order.`;

  let raw: string;
  if (youtubeUrl && videoId) {
    raw = await generateContentWithYouTubeWatchUrl(
      `https://www.youtube.com/watch?v=${videoId}`,
      prompt,
      0.2
    );
  } else {
    const model = env.geminiModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.geminiApiKey()}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    });
    if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  const steps = parseStepsJson(raw);
  if (steps.length === 0) {
    throw new Error("AI did not return valid steps.");
  }
  return steps;
}
