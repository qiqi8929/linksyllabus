import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export function createSupabaseBrowserClient() {
  return createBrowserClient(env.supabase.url(), env.supabase.anonKey(), {
    // Avoid a client created during SSR/pre-render being cached for the browser.
    isSingleton: false
  });
}

