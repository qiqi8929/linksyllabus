/** Stored in `steps.youtube_url` for Supabase Storage-backed tutorial videos. */
export const TUTORIAL_VIDEO_BUCKET = "tutorial-videos";

const PREFIX = `ls-storage://${TUTORIAL_VIDEO_BUCKET}/`;

export function buildStorageVideoRef(objectPath: string): string {
  const p = objectPath.replace(/^\/+/, "").trim();
  if (!p) {
    throw new Error("Storage path is required.");
  }
  return `${PREFIX}${p}`;
}

export function parseStorageVideoPath(url: string): string | null {
  const u = url.trim();
  if (!u.startsWith(PREFIX)) return null;
  return u.slice(PREFIX.length).trim() || null;
}

export function isStorageVideoUrl(url: string): boolean {
  return parseStorageVideoPath(url) != null;
}
