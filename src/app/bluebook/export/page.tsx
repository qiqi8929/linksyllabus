import { redirect } from "next/navigation";
import { ExportClient } from "@/components/bluebook/ExportClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function BluebookExportPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bluebook/export");

  const { data: profile } = await supabase
    .from("users")
    .select("bluebook_onboarding_complete")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.bluebook_onboarding_complete) {
    redirect("/bluebook/onboarding");
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
