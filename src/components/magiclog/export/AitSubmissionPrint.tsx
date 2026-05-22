import type { HourLogRow, SignedWorkOrderExport } from "@/lib/magiclog/exportData";
import type { MagicLogUserProfile } from "@/lib/magiclog/types";
import type { ComputedPeriodProgress } from "@/lib/magiclog/computeProgress";
import type { PeriodRequirements } from "@/lib/magiclog/constants";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <p>
      <strong>{label}</strong>
      <span className="bb-export-line">{value || " "}</span>
    </p>
  );
}

export function AitSubmissionPrint({
  apprenticeName,
  profile,
  period,
  progress,
  requirements,
  signedOrders,
  hourLogs
}: {
  apprenticeName: string;
  profile: MagicLogUserProfile;
  period: number;
  progress: ComputedPeriodProgress;
  requirements: PeriodRequirements;
  signedOrders: SignedWorkOrderExport[];
  hourLogs: HourLogRow[];
}) {
  const mandatory = signedOrders.filter((o) => o.competence_type === "mandatory");
  const optional = signedOrders.filter((o) => o.competence_type === "optional");

  return (
    <section className="bb-export-print-root">
      <article className="bb-export-page">
        <h1>End of Period {period} — Sponsor&apos;s Competence Endorsement</h1>
        <section className="bb-export-meta">
          <p>
            <strong>Apprentice:</strong> {apprenticeName}
          </p>
          <p>
            <strong>AIT identifier:</strong> {profile.ait_id || "—"}
          </p>
          <p>
            <strong>Trade:</strong> {profile.trade || "—"} · <strong>Period:</strong> {period}
          </p>
        </section>
        <p>
          I am satisfied that a qualified mentor has assessed competence for the apprentice
          and has determined that the apprentice has demonstrated competency for the
          following work:
        </p>
        <h2>Completed competences</h2>
        <p>
          Mandatory: {progress.mandatory_completed} / {requirements.mandatoryRequired} ·
          Optional: {progress.optional_completed} / {requirements.optionalRequired} · Total
          signed: {progress.total_competences}
        </p>
        <ul>
          {mandatory.map((o) => (
            <li key={o.id}>
              {o.competence_name} (mandatory)
              {o.signed_at
                ? ` — ${new Date(o.signed_at).toLocaleDateString("en-CA")}`
                : ""}
            </li>
          ))}
          {optional.map((o) => (
            <li key={o.id}>
              {o.competence_name} (optional)
              {o.signed_at
                ? ` — ${new Date(o.signed_at).toLocaleDateString("en-CA")}`
                : ""}
            </li>
          ))}
        </ul>
        <section className="bb-export-sign-grid">
          <section>
            <Field label="Sponsor printed name" value={profile.sponsor_name} />
            <Field label="Sponsor phone number" value={profile.sponsor_phone} />
            <Field label="Sponsor AIT identifier" value="" />
          </section>
          <section>
            <p>
              <strong>Sponsor signature</strong>
              <span className="bb-export-line" />
            </p>
            <p>
              <strong>Apprentice signature</strong>
              <span className="bb-export-line" />
            </p>
            <Field label="Date" value="" />
          </section>
        </section>
      </article>

      <article className="bb-export-page">
        <h1>Verification of On-the-Job Instruction Hours</h1>
        <section className="bb-export-meta">
          <p>
            <strong>Apprentice:</strong> {apprenticeName}
          </p>
          <p>
            <strong>AIT identifier:</strong> {profile.ait_id || "—"}
          </p>
          <p>
            <strong>Trade:</strong> {profile.trade || "—"} · <strong>Period:</strong> {period}
          </p>
          <p>
            <strong>Agreement start date:</strong>{" "}
            {profile.apprenticeship_start_date
              ? new Date(profile.apprenticeship_start_date).toLocaleDateString("en-CA")
              : "—"}
          </p>
        </section>
        <p>
          <strong>Total on-the-job hours (Period {period}):</strong>{" "}
          {progress.total_hours.toFixed(2)} hours
        </p>
        <h2>Hours by competence / task</h2>
        <table className="bb-export-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Competence / task</th>
              <th>Type</th>
              <th>Hours</th>
            </tr>
          </thead>
          <tbody>
            {hourLogs.length === 0 ? (
              <tr>
                <td colSpan={4}>No hours logged yet.</td>
              </tr>
            ) : (
              hourLogs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.logged_at).toLocaleDateString("en-CA")}</td>
                  <td>
                    {log.work_order?.task_name ||
                      log.work_order?.competence_name ||
                      "—"}
                  </td>
                  <td>{log.work_order?.competence_type ?? "—"}</td>
                  <td>{Number(log.hours).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>
                <strong>Total</strong>
              </td>
              <td>
                <strong>{progress.total_hours.toFixed(2)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
        <section className="bb-export-sign-grid" style={{ marginTop: 24 }}>
          <section>
            <p>
              <strong>Sponsor signature</strong>
              <span className="bb-export-line" />
            </p>
          </section>
          <section>
            <Field label="Date" value="" />
          </section>
        </section>
        <p style={{ marginTop: 16, fontSize: 10, color: "#555" }}>
          Print both pages, obtain sponsor signatures, and submit to AIT via the MyTradesecrets
          portal. Individual work-order mentor signatures are retained by the apprentice only.
        </p>
      </article>
    </section>
  );
}
