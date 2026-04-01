import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";

export type StepForGemini = {
  stepName: string;
  videoUrl: string;
  startTime: number;
  endTime: number;
};

/**
 * Returns one English description per step (same order as input).
 */
export async function generateStepDescriptions(
  tutorialName: string,
  steps: StepForGemini[]
): Promise<string[]> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  if (steps.length === 0) return [];

  const lines = steps.map(
    (s, i) =>
      `${i + 1}. Name: ${s.stepName}\n   Video: ${s.videoUrl}\n   Clip: ${s.startTime}s–${s.endTime}s`
  );

  const prompt = `You are writing short instructional blurbs for a multi-step video tutorial.

Tutorial title: "${tutorialName}"

For each numbered step below, write ONE concise English description (2–4 sentences) explaining what the learner should focus on or do in that segment, based on the step name and context. Do not repeat the title verbatim in every step.

Steps:
${lines.join("\n\n")}

Respond with a JSON object ONLY, in this exact shape:
{"descriptions":["...","...",...]}
There must be exactly ${steps.length} strings in "descriptions", in the same order as the steps.`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0.6,
      responseMimeType: "application/json"
    }
  });

  let text: string;
  try {
    const result = await model.generateContent(prompt);
    text = result.response.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Gemini request failed: ${msg}`);
  }

  if (!text) {
    throw new Error("Empty response from Gemini");
  }

  let parsed: { descriptions?: string[] };
  try {
    parsed = JSON.parse(text) as { descriptions?: string[] };
  } catch {
    throw new Error("Gemini returned non-JSON text");
  }

  const descriptions = parsed.descriptions;
  if (!Array.isArray(descriptions) || descriptions.length !== steps.length) {
    throw new Error(
      `Expected ${steps.length} descriptions, got ${descriptions?.length ?? 0}`
    );
  }

  return descriptions.map((d) => String(d ?? "").trim());
}
