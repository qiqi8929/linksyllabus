import { redirect } from "next/navigation";
import { ExportClient } from "@/components/magiclog/ExportClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function BluebookExportPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/magiclog/export");

  const { data: profile } = await supabase
    .from("users")
    .select("magiclog_onboarding_complete")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.magiclog_onboarding_complete) {
    redirect("/magiclog/onboarding");
  }

  return (
    <section>
      <p className="mb-4 text-sm text-zinc-600">
        Export your period-end AIT submission package, then use Submit to AIT to save the PDF and
        open MyTradesecrets.
      </p>
      <ExportClient />
    </section>
  );
}
