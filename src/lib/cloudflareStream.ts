const STREAM_ID_RE = /^[A-Za-z0-9_-]{20,}$/;

export function isCloudflareStreamVideoId(value: string): boolean {
  const v = value.trim();
  if (!v || v.includes("://")) return false;
  return STREAM_ID_RE.test(v);
}

export function buildCloudflareIframeUrl(
  customerSubdomain: string,
  videoId: string
): string {
  const sub = customerSubdomain.trim();
  const id = videoId.trim();
  if (!sub) throw new Error("Missing Cloudflare Stream customer subdomain.");
  if (!isCloudflareStreamVideoId(id)) {
    throw new Error("Invalid Cloudflare Stream video id.");
  }
  return `https://${sub}/${encodeURIComponent(id)}/iframe`;
}

/** Public MP4 URL for AI analyzers that require a direct media file URI. */
export function buildCloudflareDownloadUrl(
  customerSubdomain: string,
  videoId: string
): string {
  const sub = customerSubdomain.trim();
  const id = videoId.trim();
  if (!sub) throw new Error("Missing Cloudflare Stream customer subdomain.");
  if (!isCloudflareStreamVideoId(id)) {
    throw new Error("Invalid Cloudflare Stream video id.");
  }
  return `https://${sub}/${encodeURIComponent(id)}/downloads/default.mp4`;
}

type CfStreamDownloadsPayload = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: {
    default?: { status?: string; url?: string; percentComplete?: number };
  };
};

function parseCfJson(text: string): CfStreamDownloadsPayload {
  try {
    return text ? (JSON.parse(text) as CfStreamDownloadsPayload) : {};
  } catch {
    return {};
  }
}

function cfErrorMessage(res: Response, text: string, data: CfStreamDownloadsPayload): string {
  return (
    data.errors?.[0]?.message?.trim() ||
    text.trim().slice(0, 280) ||
    `Cloudflare Stream API error (HTTP ${res.status}).`
  );
}

function streamVideoDownloadsBase(accountId: string, videoId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId.trim())}/stream/${encodeURIComponent(videoId.trim())}`;
}

/** POST `/downloads` — starts default MP4 generation (returns quickly). */
export async function requestCloudflareStreamDefaultMp4Download(params: {
  accountId: string;
  apiToken: string;
  videoId: string;
}): Promise<void> {
  const accountId = params.accountId.trim();
  const apiToken = params.apiToken.trim();
  const videoId = params.videoId.trim();
  if (!isCloudflareStreamVideoId(videoId)) {
    throw new Error("Invalid Cloudflare Stream video id.");
  }
  const base = streamVideoDownloadsBase(accountId, videoId);
  const postRes = await fetch(`${base}/downloads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  const postText = await postRes.text();
  const postData = parseCfJson(postText);
  if (!postRes.ok || postData.success === false) {
    throw new Error(cfErrorMessage(postRes, postText, postData));
  }
}

/** Poll GET `/downloads` until `default.status === "ready"` (or timeout). */
export async function waitForCloudflareStreamDefaultMp4Ready(params: {
  accountId: string;
  apiToken: string;
  videoId: string;
  /** @default 180_000 */
  maxWaitMs?: number;
  /** @default 2500 */
  intervalMs?: number;
}): Promise<void> {
  const accountId = params.accountId.trim();
  const apiToken = params.apiToken.trim();
  const videoId = params.videoId.trim();
  if (!isCloudflareStreamVideoId(videoId)) {
    throw new Error("Invalid Cloudflare Stream video id.");
  }
  const base = streamVideoDownloadsBase(accountId, videoId);
  const auth = { Authorization: `Bearer ${apiToken}` } as const;
  const maxWaitMs = params.maxWaitMs ?? 180_000;
  const intervalMs = params.intervalMs ?? 2500;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const getRes = await fetch(`${base}/downloads`, { headers: { ...auth } });
    const getText = await getRes.text();
    const getData = parseCfJson(getText);
    if (!getRes.ok || getData.success === false) {
      throw new Error(cfErrorMessage(getRes, getText, getData));
    }
    const status = getData.result?.default?.status;
    if (status === "ready") return;
    if (status === "error") {
      throw new Error("Cloudflare Stream reported an error while generating the MP4 download.");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for Cloudflare Stream MP4 download to become ready.");
}

/**
 * Ensures default MP4 download exists and is ready (POST `/downloads` + poll), so
 * `{customer_subdomain}/{videoId}/downloads/default.mp4` can be fetched (e.g. by Gemini).
 * @see https://developers.cloudflare.com/stream/viewing-videos/download-videos/
 */
export async function setCloudflareStreamVideoDownloadable(params: {
  accountId: string;
  apiToken: string;
  videoId: string;
}): Promise<void> {
  const accountId = params.accountId.trim();
  const apiToken = params.apiToken.trim();
  const videoId = params.videoId.trim();
  if (!isCloudflareStreamVideoId(videoId)) {
    throw new Error("Invalid Cloudflare Stream video id.");
  }
  const base = streamVideoDownloadsBase(accountId, videoId);
  const auth = { Authorization: `Bearer ${apiToken}` } as const;

  const probeRes = await fetch(`${base}/downloads`, { headers: { ...auth } });
  if (probeRes.ok) {
    const probeText = await probeRes.text();
    const probeData = parseCfJson(probeText);
    if (probeData.success !== false && probeData.result?.default?.status === "ready") {
      return;
    }
  }

  await requestCloudflareStreamDefaultMp4Download(params);
  await waitForCloudflareStreamDefaultMp4Ready(params);
}
