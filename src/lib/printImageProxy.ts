/**
 * Hosts allowed for `/api/print-image-proxy` — server must enforce the same rules.
 * Used client-side only to rewrite clone DOM for html2canvas (same-origin fetch).
 */
export function isAllowedPrintImageProxyUrl(url: URL): boolean {
  if (url.protocol !== "https:") {
    return false;
  }
  const h = url.hostname.toLowerCase();
  if (h === "img.youtube.com") {
    return true;
  }
  if (h.endsWith(".ytimg.com")) {
    return true;
  }
  if (h.endsWith(".googleusercontent.com")) {
    return true;
  }
  if (h.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/object/public")) {
    return true;
  }
  if (h.endsWith(".vimeocdn.com")) {
    return true;
  }
  return false;
}
