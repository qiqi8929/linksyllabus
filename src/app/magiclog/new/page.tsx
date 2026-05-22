import { Suspense } from "react";
import { redirect } from "next/navigation";
import { NewWorkOrderClient } from "@/components/magiclog/NewWorkOrderClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const INTRO: Record<string, string> = {
  voice: "Hold the microphone and say what you worked on. Release to create your work order with AI steps.",
  photo: "Upload or take a photo of your work. AI will identify the task and create your work order.",
  quick: "Enter your task, hours, and date to log work quickly.",
  learn: "Choose how you want to record this competence — learn with video, checklist only, or quick hour log."
};

function NewWorkOrderIntro({ mode }: { mode: string | undefined }) {
  const text =
    (mode && INTRO[mode]) ??
    "Choose how you want to record this competence — learn with video, checklist only, or quick hour log.";
  return <p className="mb-4 text-sm text-zinc-600">{text}</p>;
}

export default async function BluebookNewWorkOrderPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/magiclog/new");

  const { data: profile } = await supabase
    .from("users")
    .select("current_period,bluebook_onboarding_complete")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.bluebook_onboarding_complete) {
    redirect("/magiclog/onboarding");
  }

  const { mode } = await searchParams;

  return (
    <section>
      <NewWorkOrderIntro mode={mode} />
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <NewWorkOrderClient defaultPeriod={profile.current_period ?? 1} />
      </Suspense>
    </section>
  );
}
