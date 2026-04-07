import { stripLeadingStepNumberFromTitle } from "@/lib/stepTitle";
import "./print-manual.css";

type StepRow = {
  id: string;
  step_number: number;
  step_name: string;
  description: string;
};

export type SkuPrint = {
  id: string;
  name: string;
  description: string;
  creator_name: string | null;
  creator_site: string | null;
  creator_logo: string | null;
  level: string | null;
  /** Resolved on server: skus.creator_name or skus.author only (never account username) */
  display_creator_name: string;
  /** Resolved on server: DB level or "General" */
  display_level: string;
};

function formatStepNum(n: number): string {
  return String(n).padStart(2, "0");
}

function descriptionToParas(desc: string): string[] {
  const t = desc.trim();
  if (!t) return [];
  const blocks = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks;
  return t.split("\n").map((l) => l.trim()).filter(Boolean);
}

const DEFAULT_COVER_BLURB =
  "Scan the QR code next to each step to watch that moment in the video. No searching. No scrubbing. Just make.";

function StepBlock({
  step,
  qrSrc
}: {
  step: StepRow;
  qrSrc: string;
}) {
  const paras = descriptionToParas(step.description);
  return (
    <div className="pm-step-block">
      <div className="pm-step-header">
        <span className="pm-step-num">Step {formatStepNum(step.step_number)}</span>
        <h3 className="pm-step-title">
          {stripLeadingStepNumberFromTitle(step.step_name)}
        </h3>
      </div>
      <div className="pm-step-body">
        <div className="pm-step-text">
          {paras.length > 0 ? (
            paras.map((p, i) => <p key={i}>{p}</p>)
          ) : (
            <p>No written description for this step.</p>
          )}
        </div>
        <div className="pm-qr-wrap">
          <div className="pm-qr-box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="" width={80} height={80} />
          </div>
          <span className="pm-qr-caption">Scan to watch</span>
        </div>
      </div>
    </div>
  );
}

export function PrintManualView({
  sku,
  steps
}: {
  sku: SkuPrint;
  steps: StepRow[];
}) {
  const creatorName = sku.display_creator_name;
  const creatorSite = sku.creator_site?.trim() || "";
  const level = sku.display_level;
  const subtitle = sku.description?.trim() || DEFAULT_COVER_BLURB;

  const pairs: [StepRow, StepRow | null][] = [];
  for (let i = 0; i < steps.length; i += 2) {
    pairs.push([steps[i], steps[i + 1] ?? null]);
  }
  const totalContentPages = Math.max(1, pairs.length);

  const footerLeft =
    creatorSite.length > 0 ? `${creatorName} · ${creatorSite}` : creatorName;

  return (
    <div className="pm-manual">
      <div className="pm-cover">
        <div className="pm-cover-inner">
          <div className="pm-creator-logo">
            {sku.creator_logo?.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sku.creator_logo.trim()} alt="" />
            ) : (
              <span className="pm-creator-logo-text">{creatorName}</span>
            )}
          </div>
          <h1 className="pm-cover-title">{sku.name}</h1>
          <p className="pm-cover-desc">{subtitle}</p>
          <div className="pm-cover-meta">
            <div className="pm-meta-item">
              <span className="pm-meta-label">Steps</span>
              <span className="pm-meta-value">{steps.length}</span>
            </div>
            <div className="pm-meta-item">
              <span className="pm-meta-label">Creator</span>
              <span className="pm-meta-value">{creatorName}</span>
            </div>
            <div className="pm-meta-item">
              <span className="pm-meta-label">Level</span>
              <span className="pm-meta-value">{level}</span>
            </div>
          </div>
        </div>
      </div>

        {steps.length === 0 ? (
          <div className="pm-page">
            <p className="pm-step-text">No steps to print yet.</p>
            <div className="pm-page-footer">
              <span className="pm-footer-creator">{footerLeft}</span>
              <span className="pm-footer-page">Page 1 of 1</span>
            </div>
          </div>
        ) : (
          pairs.map((pair, idx) => {
            const [left, right] = pair;
            const pageNum = idx + 1;
            return (
              <div key={left.id} className="pm-page">
                <div className="pm-steps-pair">
                  <StepBlock
                    step={left}
                    qrSrc={`/api/qr/${encodeURIComponent(left.id)}`}
                  />
                  {right ? (
                    <StepBlock
                      step={right}
                      qrSrc={`/api/qr/${encodeURIComponent(right.id)}`}
                    />
                  ) : (
                    <div aria-hidden />
                  )}
                </div>
                <div className="pm-page-footer">
                  <span className="pm-footer-creator">{footerLeft}</span>
                  <span className="pm-footer-page">
                    Page {pageNum} of {totalContentPages}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
  );
}
