import { fetchTranscript, type TranscriptResponse } from "youtube-transcript";

export type TranscriptCue = {
  text: string;
  /** Start time in seconds from video start */
  start: number;
  /** Duration in seconds */
  duration: number;
};

/**
 * InnerTube srv3 captions often use ms; classic timedtext uses seconds.
 * Heuristic: if any cue has large offset/duration, treat all as ms.
 */
function normalizeToSeconds(raw: TranscriptResponse[]): TranscriptCue[] {
  const useMs = raw.some((r) => r.offset > 500 || r.duration > 300);
  const scale = useMs ? 1 / 1000 : 1;
  return raw.map((r) => ({
    text: r.text,
    start: r.offset * scale,
    duration: r.duration * scale
  }));
}

/**
 * Fetch YouTube captions as timed segments (unofficial API; may fail if captions are off).
 */
export async function getTranscript(videoId: string): Promise<TranscriptCue[]> {
  const raw = await fetchTranscript(videoId);
  return normalizeToSeconds(raw);
}
