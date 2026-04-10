import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lists model resource names available to `GEMINI_API_KEY` (same as
 * `GET https://generativelanguage.googleapis.com/v1beta/models?key=...`).
 * Auth required — for debugging which IDs support `generateContent`, YouTube, etc.
 */
export async function GET(req: Request) {
  if (!env.geminiApiKey()) {
    return NextResponse.json(
      { error: "AI is not configured (missing GEMINI_API_KEY)." },
      { status: 503 }
    );
  }

  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = env.geminiApiKey()!;
  const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("pageSize", "100");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" }
  });

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: `ListModels failed: ${res.status}`, detail: text },
      { status: 502 }
    );
  }

  let parsed: {
    models?: Array<{
      name?: string;
      supportedGenerationMethods?: string[];
    }>;
    nextPageToken?: string;
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return NextResponse.json(
      { error: "ListModels returned non-JSON", detail: text.slice(0, 500) },
      { status: 502 }
    );
  }

  const models = parsed.models ?? [];
  const names = models.map((m) => m.name ?? "").filter(Boolean);

  const verbose = new URL(req.url).searchParams.get("verbose") === "1";
  if (verbose) {
    return NextResponse.json({
      names,
      nextPageToken: parsed.nextPageToken ?? null,
      models: models.map((m) => ({
        name: m.name,
        supportedGenerationMethods: m.supportedGenerationMethods ?? []
      }))
    });
  }

  return NextResponse.json({
    names,
    nextPageToken: parsed.nextPageToken ?? null
  });
}
