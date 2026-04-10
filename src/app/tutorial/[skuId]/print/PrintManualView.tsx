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
  creator_logo: string | null;
  level: string | null;
  materials_text: string | null;
  tools_text: string | null;
  /** Resolved on server: DB level or "General" */
  display_level: string;
  /** YouTube thumbnail or other cover art for print cover; omit section when null */
  cover_hero_image_url: string | null;
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
  const level = sku.display_level;
  const subtitle = sku.description?.trim() || DEFAULT_COVER_BLURB;
  const coverHeroSrc = sku.cover_hero_image_url?.trim() || "";

  const pairs: [StepRow, StepRow | null][] = [];
  for (let i = 0; i < steps.length; i += 2) {
    pairs.push([steps[i], steps[i + 1] ?? null]);
  }
  const totalContentPages = Math.max(1, pairs.length);

  const footerBrand = "linksyllabus.com";

  const materialsBody = sku.materials_text?.trim() ?? "";
  const toolsBody = sku.tools_text?.trim() ?? "";
  const showMaterialsSheet = materialsBody.length > 0 || toolsBody.length > 0;

  return (
    <div className="pm-manual">
      <div className="pm-cover">
        <div className="pm-cover-layout">
          <div className="pm-cover-main">
            {sku.creator_logo?.trim() ? (
              <div className="pm-creator-logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sku.creator_logo.trim()} alt="" />
              </div>
            ) : null}
            <h1 className="pm-cover-title">{sku.name}</h1>
            {coverHeroSrc ? (
              <div className="pm-cover-hero">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverHeroSrc} alt="" />
              </div>
            ) : null}
            <p className="pm-cover-desc">{subtitle}</p>
            <div className="pm-cover-meta">
              <div className="pm-meta-item">
                <span className="pm-meta-label">Steps</span>
                <span className="pm-meta-value">{steps.length}</span>
              </div>
              <div className="pm-meta-item">
                <span className="pm-meta-label">Level</span>
                <span className="pm-meta-value">{level}</span>
              </div>
            </div>
          </div>
          <div className="pm-cover-qr-aside">
            <div className="pm-cover-qr-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/qr/tutorial/${encodeURIComponent(sku.id)}`}
                alt=""
                width={112}
                height={112}
              />
            </div>
            <span className="pm-cover-qr-caption">
              Scan to follow along on your phone
            </span>
          </div>
        </div>
      </div>

      {showMaterialsSheet ? (
        <div className="pm-page pm-materials-sheet">
          <div className="pm-materials-inner">
            <h2 className="pm-materials-title">Materials & Tools</h2>
            <p className="pm-materials-sub">
              List everything your viewer needs before they start
            </p>
            {materialsBody ? (
              <section className="pm-materials-section">
                <h3 className="pm-materials-label">Materials</h3>
                <div className="pm-materials-body">{materialsBody}</div>
              </section>
            ) : null}
            {toolsBody ? (
              <section className="pm-materials-section">
                <h3 className="pm-materials-label">Tools</h3>
                <div className="pm-materials-body">{toolsBody}</div>
              </section>
            ) : null}
          </div>
          <div className="pm-page-footer">
            <span className="pm-footer-creator">{footerBrand}</span>
            <span className="pm-footer-page">Before you start</span>
          </div>
        </div>
      ) : null}

      {steps.length === 0 ? (
        <div className="pm-page">
          <p className="pm-step-text">No steps to print yet.</p>
          <p className="pm-page-promo">
            Turn any YouTube tutorial into a printable QR guide in 3 minutes.
            <br />
            Free at{" "}
            <span className="pm-page-promo-url">linksyllabus.com/try</span>
          </p>
          <div className="pm-page-footer">
            <span className="pm-footer-creator">{footerBrand}</span>
            <span className="pm-footer-page">Page 1 of 1</span>
          </div>
        </div>
      ) : (
        pairs.map((pair, idx) => {
          const [left, right] = pair;
          const pageNum = idx + 1;
          const isLastPage = idx === pairs.length - 1;
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
              {isLastPage ? (
                <p className="pm-page-promo">
                  Turn any YouTube tutorial into a printable QR guide in 3
                  minutes.
                  <br />
                  Free at{" "}
                  <span className="pm-page-promo-url">linksyllabus.com/try</span>
                </p>
              ) : null}
              <div className="pm-page-footer">
                <span className="pm-footer-creator">{footerBrand}</span>
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
