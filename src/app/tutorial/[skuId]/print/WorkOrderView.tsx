import {
  descriptionToWorkOrderBullets,
  formatWorkOrderLevelLine,
  formatWorkOrderMaterialsLine,
  formatWorkOrderStepNum,
  splitStepsForWorkOrderPages,
  workOrderStepTitle,
  type WorkOrderSku,
  type WorkOrderStep
} from "./workOrderContent";
import "./work-order.css";

function BlankField({ label, wide }: { label: string; wide?: boolean }) {
  return (
    <div className={`wo-field${wide ? " wo-field-wide" : ""}`}>
      <span className="wo-field-label">{label}</span>
      <span className="wo-field-line" aria-hidden />
    </div>
  );
}

function WorkOrderStepRow({ step }: { step: WorkOrderStep }) {
  const bullets = descriptionToWorkOrderBullets(step.description);
  return (
    <div className="wo-step">
      <div className="wo-step-main">
        <div className="wo-step-label">
          Step {formatWorkOrderStepNum(step.step_number)}
        </div>
        <h3 className="wo-step-title">{workOrderStepTitle(step)}</h3>
        <ul className="wo-step-bullets">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
      <div className="wo-step-aside">
        <span className="wo-step-check" aria-hidden />
        <a
          className="wo-step-qr"
          href={`/play/${encodeURIComponent(step.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Watch step ${step.step_number}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/qr/${encodeURIComponent(step.id)}?surface=work-order`}
            alt=""
            width={52}
            height={52}
          />
          <span className="wo-step-qr-caption">Scan to watch</span>
        </a>
      </div>
    </div>
  );
}

function WorkOrderStepsBlock({ steps }: { steps: WorkOrderStep[] }) {
  if (steps.length === 0) return null;
  return (
    <section className="wo-steps-section">
      <h2 className="wo-section-heading">Steps</h2>
      <div className="wo-steps-list">
        {steps.map((s) => (
          <WorkOrderStepRow key={s.id} step={s} />
        ))}
      </div>
    </section>
  );
}

function WorkOrderSignOff() {
  return (
    <section className="wo-signoff">
      <div className="wo-signoff-col wo-signoff-master">
        <div className="wo-signoff-head">Master / Supervisor</div>
        <div className="wo-signoff-grid">
          <BlankField label="Assigned time" />
          <BlankField label="Verification time" />
          <BlankField label="Total hours" />
          <BlankField label="Signature (assign)" wide />
          <BlankField label="Signature (verify + approve)" wide />
        </div>
      </div>
      <div className="wo-signoff-col wo-signoff-apprentice">
        <div className="wo-signoff-head">Apprentice</div>
        <div className="wo-signoff-grid">
          <BlankField label="Name" wide />
          <BlankField label="Start time" />
          <BlankField label="Finish time" />
          <div className="wo-field wo-field-yn">
            <span className="wo-field-label">All steps completed?</span>
            <span className="wo-yn">Y / N</span>
          </div>
          <BlankField label="Signature" wide />
        </div>
      </div>
    </section>
  );
}

function WorkOrderFooter({
  stepCount,
  levelLine
}: {
  stepCount: number;
  levelLine: string;
}) {
  const stepsLabel = stepCount === 1 ? "1 step" : `${stepCount} steps`;
  return (
    <footer className="wo-footer">
      <span>linksyllabus.com</span>
      <span>
        {stepsLabel} · QR guide · {levelLine}
      </span>
      <span>© LinkSyllabus</span>
    </footer>
  );
}

function WorkOrderPageShell({
  sku,
  steps,
  page1Steps,
  page2Steps,
  materialsLine,
  levelLine
}: {
  sku: WorkOrderSku;
  steps: WorkOrderStep[];
  page1Steps: WorkOrderStep[];
  page2Steps: WorkOrderStep[];
  materialsLine: string;
  levelLine: string;
}) {
  return (
    <>
      <article className="wo-page">
        <header className="wo-header">
          <div className="wo-header-main">
            <h1 className="wo-title">{sku.name}</h1>
            <p className="wo-level-line">{levelLine}</p>
          </div>
          <div className="wo-header-meta">
            <BlankField label="Work order #" />
            <BlankField label="Date" />
          </div>
        </header>

        <section className="wo-info-grid">
          <BlankField label="Shop name" />
          <BlankField label="Apprentice name" />
          <BlankField label="License plate" />
          <BlankField label="Vehicle year / make / model" wide />
          <BlankField label="Master / supervisor" wide />
        </section>

        {materialsLine ? (
          <section className="wo-materials">
            <h2 className="wo-section-heading">Materials &amp; tools</h2>
            <p className="wo-materials-line">{materialsLine}</p>
          </section>
        ) : null}

        <WorkOrderStepsBlock steps={page1Steps} />
        {page2Steps.length === 0 ? (
          <>
            <WorkOrderSignOff />
            <WorkOrderFooter stepCount={steps.length} levelLine={levelLine} />
          </>
        ) : null}
      </article>

      {page2Steps.length > 0 ? (
        <article className="wo-page wo-page-break">
          <WorkOrderStepsBlock steps={page2Steps} />
          <WorkOrderSignOff />
          <WorkOrderFooter stepCount={steps.length} levelLine={levelLine} />
        </article>
      ) : null}
    </>
  );
}

export function WorkOrderView({
  sku,
  steps
}: {
  sku: WorkOrderSku;
  steps: WorkOrderStep[];
}) {
  const materialsLine = formatWorkOrderMaterialsLine(
    sku.materials_text,
    sku.tools_text
  );
  const levelLine = formatWorkOrderLevelLine(sku.display_level, steps.length);
  const [page1Steps, page2Steps] = splitStepsForWorkOrderPages(steps);

  if (steps.length === 0) {
    return (
      <div className="wo-manual" id="wo-manual-root">
        <article className="wo-page">
          <p className="wo-materials-line">No steps to print yet.</p>
        </article>
      </div>
    );
  }

  return (
    <div className="wo-manual" id="wo-manual-root">
      <WorkOrderPageShell
        sku={sku}
        steps={steps}
        page1Steps={page1Steps}
        page2Steps={page2Steps}
        materialsLine={materialsLine}
        levelLine={levelLine}
      />
    </div>
  );
}
