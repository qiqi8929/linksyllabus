import { notFound, redirect } from "next/navigation";
import { AitSubmissionPrint } from "@/components/bluebook/export/AitSubmissionPrint";
import { ExportPrintBar } from "@/components/bluebook/export/ExportPrintBar";
import { PersonalRecordPrint } from "@/components/bluebook/export/PersonalRecordPrint";
import { ProgressSummaryPrint } from "@/components/bluebook/export/ProgressSummaryPrint";
import { fetchBluebookExportBundle } from "@/lib/bluebook/exportData";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "../export-print.css";

const VALID_TYPES = new Set(["ait-submission", "personal-record", "progress-summary"]);

export default async function BluebookExportPrintPage({
  searchParams
}: {
  searchParams: { type?: string; period?: string; autoprint?: string };
}) {
  const type = searchParams.type ?? "";
  if (!VALID_TYPES.has(type)) notFound();

  const period = Math.max(1, Math.min(4, Math.floor(Number(searchParams.period ?? 1))));

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bluebook/export/print?type=${type}&period=${period}`);

  const bundle = await fetchBluebookExportBundle(supabase, user.id, period);
  if (!bundle) notFound();

  const backHref = `/bluebook/export`;
  const autoPrint = searchParams.autoprint === "1";

  return (
    <>
      <ExportPrintBar backHref={backHref} autoPrint={autoPrint} />
      {type === "ait-submission" ? (
        <AitSubmissionPrint
          apprenticeName={bundle.apprenticeName}
          profile={bundle.profile}
          period={bundle.period}
          progress={bundle.progress}
          requirements={bundle.requirements}
          signedOrders={bundle.signedOrders}
          hourLogs={bundle.hourLogs}
        />
      ) : null}
      {type === "personal-record" ? (
        <PersonalRecordPrint
          apprenticeName={bundle.apprenticeName}
          profile={bundle.profile}
          orders={bundle.allSignedOrders}
        />
      ) : null}
      {type === "progress-summary" ? (
        <ProgressSummaryPrint
          apprenticeName={bundle.apprenticeName}
          profile={bundle.profile}
          period={bundle.period}
          progress={bundle.progress}
          requirements={bundle.requirements}
          estimatedCompletion={bundle.estimatedCompletion}
        />
      ) : null}
    </>
  );
}
