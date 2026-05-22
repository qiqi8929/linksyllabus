import type { ComputedPeriodProgress } from "@/lib/magiclog/computeProgress";
import type { PeriodRequirements } from "@/lib/magiclog/constants";
import type { BluebookUserProfile } from "@/lib/magiclog/types";

export function ProgressSummaryPrint({
  apprenticeName,
  profile,
  period,
  progress,
  requirements,
  estimatedCompletion
}: {
  apprenticeName: string;
  profile: BluebookUserProfile;
  period: number;
  progress: ComputedPeriodProgress;
  requirements: PeriodRequirements;
  estimatedCompletion: string | null;
}) {
  const hoursPct = Math.min(
    100,
    Math.round((progress.total_hours / requirements.hoursRequired) * 100)
  );
  const mandPct = Math.min(
    100,
    Math.round((progress.mandatory_completed / requirements.mandatoryRequired) * 100)
  );
  const optPct =
    requirements.optionalRequired > 0
      ? Math.min(
          100,
          Math.round(
            (progress.optional_completed / requirements.optionalRequired) * 100
          )
        )
      : 0;

  return (
    <section className="bb-export-print-root">
      <article className="bb-export-page" style={{ borderColor: "#e67e22" }}>
        <h1 style={{ color: "#c2410c" }}>Period {period} progress summary</h1>
        <section className="bb-export-meta">
          <p>
            <strong>{apprenticeName}</strong>
          </p>
          <p>
            {profile.trade || "Trade"} · Alberta (AIT) · Period {period}
          </p>
          <p>AIT ID: {profile.ait_id || "—"}</p>
        </section>

        <h2>Hours</h2>
        <p>
          {progress.total_hours.toFixed(1)} / {requirements.hoursRequired} hours ({hoursPct}%)
        </p>

        <h2>Mandatory competences</h2>
        <p>
          {progress.mandatory_completed} / {requirements.mandatoryRequired} ({mandPct}%)
          {progress.mandatory_completed >= requirements.mandatoryRequired ? " ✓" : ""}
        </p>

        <h2>Optional competences</h2>
        <p>
          {progress.optional_completed} / {requirements.optionalRequired}
          {requirements.optionalRequired > 0 ? ` (${optPct}%)` : " (none required this period)"}
          {progress.optional_completed >= requirements.optionalRequired &&
          requirements.optionalRequired > 0
            ? " ✓"
            : ""}
        </p>

        <h2>Period status</h2>
        <p>{progress.period_complete ? "Ready for AIT period-end submission" : "In progress"}</p>

        {estimatedCompletion ? (
          <p>
            <strong>Estimated period completion:</strong> {estimatedCompletion}
          </p>
        ) : null}

        <p style={{ marginTop: 16, fontSize: 10, color: "#555" }}>
          MVP targets are placeholders. Trade-specific AIT requirements will be configured in a
          future release.
        </p>
      </article>
    </section>
  );
}
