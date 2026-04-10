import { env } from "@/lib/env";

const GEMINI_MODEL = "gemini-2.0-flash";

/**
 * YouTube watch URLs as video input (no upload). Use the same model as text/upload paths; must support
 * `file_data` with a public `youtube.com/watch` URI (see Gemini video docs).
 */
export const GEMINI_YOUTUBE_VIDEO_MODEL = GEMINI_MODEL;

export type GeminiVideoDebugPayload = {
  responseJson: unknown;
  modelText: string;
};

/**
 * Upload raw video bytes to Google AI File API (multipart).
 * Caller must delete the file when done (`deleteGeminiFileByName`).
 */
export async function uploadVideoToGemini(
  buffer: Buffer,
  mimeType: string,
  displayName: string
): Promise<{ name: string; uri: string }> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify({ file: { display_name: displayName } })], {
      type: "application/json"
    })
  );
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    displayName
  );

  const res = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "X-Goog-Upload-Protocol": "multipart" },
      body: form
    }
  );

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini file upload failed: ${res.status} ${t}`);
  }

  const data = (await res.json()) as {
    file?: { name?: string; uri?: string };
  };
  const f = data.file;
  if (!f?.name || !f?.uri) {
    throw new Error("Gemini upload response missing file name or uri");
  }
  return { name: f.name, uri: f.uri };
}

export async function waitForGeminiFileReady(fileName: string): Promise<void> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`;

  for (let i = 0; i < 180; i++) {
    const res = await fetch(url);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Gemini file status failed: ${res.status} ${t}`);
    }
    const data = (await res.json()) as {
      state?: string;
      error?: { message?: string };
    };
    if (data.state === "ACTIVE") {
      return;
    }
    if (data.state === "FAILED") {
      throw new Error(data.error?.message ?? "Video processing failed in Gemini");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(
    "Video processing timeout — try a shorter clip, reduce resolution, or try again."
  );
}

/**
 * Analyze a **public** YouTube video by passing its watch URL as `file_data` (no captions / transcript).
 * Uses the stable **v1** `generateContent` endpoint (same model as uploaded-file video analysis).
 */
export async function generateContentWithYouTubeWatchUrl(
  watchPageUrl: string,
  prompt: string,
  temperature: number,
  onGemini?: (payload: GeminiVideoDebugPayload) => void
): Promise<string> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_YOUTUBE_VIDEO_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              file_data: {
                mime_type: "video/mp4",
                file_uri: watchPageUrl.trim()
              }
            },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini YouTube video request failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Empty response from Gemini (YouTube video)");
  }
  onGemini?.({ responseJson: data, modelText: text });
  return text;
}

export async function generateContentWithVideoFile(
  fileUri: string,
  mimeType: string,
  prompt: string,
  temperature: number,
  onGemini?: (payload: GeminiVideoDebugPayload) => void
): Promise<string> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { file_data: { mime_type: mimeType, file_uri: fileUri } },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini request failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Empty response from Gemini");
  }
  onGemini?.({ responseJson: data, modelText: text });
  return text;
}

export async function deleteGeminiFileByName(fileName: string): Promise<void> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    return;
  }
  await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`,
    { method: "DELETE" }
  );
}
