import { parseAiSteps } from "@/lib/bluebook/exportData";
import type { SignedWorkOrderExport } from "@/lib/bluebook/exportData";
import type { BluebookUserProfile } from "@/lib/bluebook/types";

export function PersonalRecordPrint({
  apprenticeName,
  profile,
  orders
}: {
  apprenticeName: string;
  profile: BluebookUserProfile;
  orders: SignedWorkOrderExport[];
}) {
  return (
    <section className="bb-export-print-root">
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 16, margin: 0 }}>Personal record — {apprenticeName}</h1>
        <p style={{ fontSize: 12, margin: "6px 0 0" }}>
          AIT {profile.ait_id || "—"} · {profile.trade || "Trade"} · For apprentice records only
          (not submitted to AIT)
        </p>
      </header>

      {orders.length === 0 ? (
        <p>No signed work orders yet.</p>
      ) : (
        orders.map((order) => {
          const steps = parseAiSteps(order.ai_steps);
          return (
            <article key={order.id} className="bb-export-wo-block">
              <h3>
                Period {order.period}: {order.competence_name}
              </h3>
              <p style={{ fontSize: 11, margin: "0 0 10px" }}>
                {order.competence_type} · {order.hours ?? "—"} hrs · Signed{" "}
                {order.signed_at
                  ? new Date(order.signed_at).toLocaleDateString("en-CA")
                  : "—"}
                {order.mentor_name ? ` · Mentor: ${order.mentor_name}` : ""}
              </p>

              <section style={{ marginBottom: 12 }}>
                <strong>My Bluebook page (competence record)</strong>
                <p style={{ fontSize: 11, marginTop: 6 }}>
                  Sponsor: {profile.sponsor_name || "—"} · Phone:{" "}
                  {profile.sponsor_phone || "—"}
                </p>
                <p style={{ fontSize: 11 }}>
                  Mentor signature:
                  {order.mentorSignatureSignedUrl ? (
                    <>
                      <br />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={order.mentorSignatureSignedUrl}
                        alt="Mentor signature"
                        className="bb-export-sig-img"
                      />
                    </>
                  ) : (
                    " —"
                  )}
                </p>
              </section>

              <section>
                <strong>My Learning page</strong>
                {steps.length === 0 ? (
                  <p style={{ fontSize: 11 }}>No steps recorded.</p>
                ) : (
                  <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 11 }}>
                    {steps.map((s) => (
                      <li key={s.step_number} className="bb-export-step">
                        <strong>
                          Step {s.step_number}: {s.title}
                        </strong>
                        <br />
                        {s.description}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </article>
          );
        })
      )}
    </section>
  );
}
