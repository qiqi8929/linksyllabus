const STORAGE_KEY = "magiclog_oauth_next";

export function stashOAuthNext(nextPath: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, nextPath);
  } catch {
    /* private mode / blocked */
  }
}

/** Read and clear stashed post-login path (set before signInWithOAuth). */
export function takeOAuthNext(): string | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    if (value) sessionStorage.removeItem(STORAGE_KEY);
    return value;
  } catch {
    return null;
  }
}
