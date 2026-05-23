import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectMagicLogTrialEntry } from "@/lib/magiclog/authRedirect";

export default async function MagicLogIndexPage() {
  const supabase = createSupabaseServerClient();
  await redirectMagicLogTrialEntry(supabase);
}
