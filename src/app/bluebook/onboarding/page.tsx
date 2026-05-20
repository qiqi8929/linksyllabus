import { Suspense } from "react";
import { OnboardingWizard } from "@/components/bluebook/OnboardingWizard";

export default function BluebookOnboardingPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-600">Loading…</p>}>
      <OnboardingWizard />
    </Suspense>
  );
}
