import { env } from "@/lib/env";

export type GeminiVideoDebugPayload = {
  responseJson: unknown;
  modelText: string;
};

const LOG_PREFIX = "[geminiVideoFileApi]";

type GoogleRpcError = {
  code?: number;
  message?: string;
  status?: string;
  details?: unknown[];
};

function formatGeminiHttpErrorBody(status: number, rawBody: string): string {
  const trimmed = rawBody.trim();
  try {
    const j = JSON.parse(trimmed) as { error?: GoogleRpcError };
    const e = j?.error;
    if (!e) return trimmed.slice(0, 4000);
    const bits: string[] = [];
    if (e.message) bits.push(e.message);
    if (e.status) bits.push(`status=${e.status}`);
    if (typeof e.code === "number") bits.push(`code=${e.code}`);
    if (e.details?.length) {
      try {
        bits.push(`details=${JSON.stringify(e.details).slice(0, 2500)}`);
      } catch {
        bits.push("details=(unserializable)");
      }
    }
    return bits.join(" | ") || trimmed.slice(0, 4000);
  } catch {
    return trimmed.slice(0, 4000) || `(empty body, HTTP ${status})`;
  }
}

function logGeminiFailure(
  step: string,
  context: Record<string, unknown>,
  status: number,
  rawBody: string
): void {
  const formatted = formatGeminiHttpErrorBody(status, rawBody);
  console.error(`${LOG_PREFIX} ${step} failed`, {
    ...context,
    httpStatus: status,
    responseBodyPreview: formatted.slice(0, 2000),
    responseBodyLength: rawBody.length
  });
}

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

  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=(redacted)`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "X-Goog-Upload-Protocol": "multipart" },
      body: form
    }
  );

  const rawText = await res.text();
  if (!res.ok) {
    logGeminiFailure(
      "uploadVideoToGemini (POST upload/v1beta/files)",
      {
        step: "file_upload_multipart",
        displayName,
        mimeType,
        bufferBytes: buffer.byteLength,
        endpoint: uploadUrl
      },
      res.status,
      rawText
    );
    throw new Error(
      `[Gemini File API: upload] HTTP ${res.status} — ${formatGeminiHttpErrorBody(res.status, rawText)}`
    );
  }

  let data: { file?: { name?: string; uri?: string } };
  try {
    data = JSON.parse(rawText) as { file?: { name?: string; uri?: string } };
  } catch {
    console.error(`${LOG_PREFIX} uploadVideoToGemini: non-JSON success body`, {
      displayName,
      bufferBytes: buffer.byteLength,
      preview: rawText.slice(0, 500)
    });
    throw new Error("[Gemini File API: upload] Success response was not valid JSON.");
  }
  const f = data.file;
  if (!f?.name || !f?.uri) {
    console.error(`${LOG_PREFIX} uploadVideoToGemini: missing file.name or file.uri`, {
      displayName,
      bufferBytes: buffer.byteLength,
      parsedKeys: data && typeof data === "object" ? Object.keys(data) : []
    });
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
    const t = await res.text();
    if (!res.ok) {
      logGeminiFailure(
        "waitForGeminiFileReady (GET file metadata)",
        {
          step: "file_poll_active",
          fileName,
          pollAttempt: i + 1,
          endpoint: `GET v1beta/${fileName}`
        },
        res.status,
        t
      );
      throw new Error(
        `[Gemini File API: file status] HTTP ${res.status} — ${formatGeminiHttpErrorBody(res.status, t)}`
      );
    }
    let data: { state?: string; error?: { message?: string } };
    try {
      data = JSON.parse(t) as { state?: string; error?: { message?: string } };
    } catch {
      console.error(`${LOG_PREFIX} waitForGeminiFileReady: non-JSON poll body`, {
        fileName,
        attempt: i + 1,
        preview: t.slice(0, 400)
      });
      throw new Error("[Gemini File API: file status] Poll response was not valid JSON.");
    }
    if (data.state === "ACTIVE") {
      return;
    }
    if (data.state === "FAILED") {
      console.error(`${LOG_PREFIX} waitForGeminiFileReady: file FAILED`, {
        fileName,
        error: data.error
      });
      throw new Error(
        data.error?.message ?? "[Gemini File API: file status] Video processing failed (state=FAILED)."
      );
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(
    "Video processing timeout — try a shorter clip, reduce resolution, or try again."
  );
}

/**
 * Analyze a **public** YouTube video by passing its watch URL as `fileData`.
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel()}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              fileData: {
                mimeType: "video/mp4",
                fileUri: watchPageUrl.trim()
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature
      }
    })
  });

  const errBody = await res.text();
  if (!res.ok) {
    logGeminiFailure(
      "generateContentWithYouTubeWatchUrl",
      { step: "generateContent", model: env.geminiModel(), source: "youtube_fileData" },
      res.status,
      errBody
    );
    throw new Error(
      `[Gemini generateContent: YouTube URL] HTTP ${res.status} — ${formatGeminiHttpErrorBody(res.status, errBody)}`
    );
  }

  let data: {
    error?: GoogleRpcError;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: unknown;
  };
  try {
    data = JSON.parse(errBody) as typeof data;
  } catch {
    throw new Error("[Gemini generateContent: YouTube] Response was not valid JSON.");
  }
  if (data.error) {
    console.error(`${LOG_PREFIX} generateContentWithYouTubeWatchUrl: error in body`, data.error);
    throw new Error(
      `[Gemini generateContent: YouTube] ${data.error.message ?? JSON.stringify(data.error)}`
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error(`${LOG_PREFIX} generateContentWithYouTubeWatchUrl: no candidate text`, {
      model: env.geminiModel(),
      promptFeedback: data.promptFeedback,
      candidatesLength: data.candidates?.length ?? 0
    });
    throw new Error("Empty response from Gemini (YouTube video)");
  }
  onGemini?.({ responseJson: data, modelText: text });
  return text;
}

/** Analyze a public video URL by passing it as fileData.fileUri. */
export async function generateContentWithPublicVideoUrl(
  videoUrl: string,
  mimeType: string,
  prompt: string,
  temperature: number,
  onGemini?: (payload: GeminiVideoDebugPayload) => void
): Promise<string> {
  const apiKey = env.geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel()}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              fileData: {
                mimeType,
                fileUri: videoUrl.trim()
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature
      }
    })
  });

  const rawBody = await res.text();
  if (!res.ok) {
    logGeminiFailure(
      "generateContentWithPublicVideoUrl",
      {
        step: "generateContent",
        model: env.geminiModel(),
        source: "public_url_fileData",
        mimeType,
        videoUrlHost: (() => {
          try {
            return new URL(videoUrl.trim()).hostname;
          } catch {
            return "(invalid-url)";
          }
        })()
      },
      res.status,
      rawBody
    );
    throw new Error(
      `[Gemini generateContent: public video URL] HTTP ${res.status} — ${formatGeminiHttpErrorBody(res.status, rawBody)}`
    );
  }

  let data: {
    error?: GoogleRpcError;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: unknown;
  };
  try {
    data = JSON.parse(rawBody) as typeof data;
  } catch {
    throw new Error("[Gemini generateContent: public URL] Response was not valid JSON.");
  }
  if (data.error) {
    console.error(`${LOG_PREFIX} generateContentWithPublicVideoUrl: error in body`, data.error);
    throw new Error(
      `[Gemini generateContent: public URL] ${data.error.message ?? JSON.stringify(data.error)}`
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error(`${LOG_PREFIX} generateContentWithPublicVideoUrl: no candidate text`, {
      model: env.geminiModel(),
      promptFeedback: data.promptFeedback,
      candidatesLength: data.candidates?.length ?? 0
    });
    throw new Error("Empty response from Gemini (public video URL)");
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

  /** fileData parts require the v1beta generateContent endpoint (v1 rejects unknown field "fileData"). */
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel()}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { fileData: { mimeType, fileUri } },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature
      }
    })
  });

  const rawBody = await res.text();
  if (!res.ok) {
    logGeminiFailure(
      "generateContentWithVideoFile (uploaded Files API reference)",
      {
        step: "generateContent",
        model: env.geminiModel(),
        source: "file_api_fileData",
        mimeType,
        fileUriPrefix: fileUri.slice(0, 96),
        promptChars: prompt.length,
        temperature
      },
      res.status,
      rawBody
    );
    throw new Error(
      `[Gemini generateContent: uploaded video file] HTTP ${res.status} — ${formatGeminiHttpErrorBody(res.status, rawBody)}`
    );
  }

  let data: {
    error?: GoogleRpcError;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: unknown;
  };
  try {
    data = JSON.parse(rawBody) as typeof data;
  } catch {
    console.error(`${LOG_PREFIX} generateContentWithVideoFile: non-JSON body`, {
      model: env.geminiModel(),
      preview: rawBody.slice(0, 400)
    });
    throw new Error("[Gemini generateContent: uploaded file] Response was not valid JSON.");
  }
  if (data.error) {
    console.error(`${LOG_PREFIX} generateContentWithVideoFile: error object in 200 body`, data.error);
    throw new Error(
      `[Gemini generateContent: uploaded file] ${data.error.message ?? JSON.stringify(data.error)}`
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error(`${LOG_PREFIX} generateContentWithVideoFile: no candidate text`, {
      model: env.geminiModel(),
      mimeType,
      fileUriPrefix: fileUri.slice(0, 96),
      promptChars: prompt.length,
      promptFeedback: data.promptFeedback,
      candidatesLength: data.candidates?.length ?? 0,
      firstCandidate: data.candidates?.[0]
        ? JSON.stringify(data.candidates[0]).slice(0, 1500)
        : undefined
    });
    throw new Error(
      "Empty response from Gemini (uploaded file): no text in candidates — see server logs for promptFeedback / finishReason."
    );
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
