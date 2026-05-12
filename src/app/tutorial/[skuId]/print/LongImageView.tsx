import { stripLeadingStepNumberFromTitle } from "@/lib/stepTitle";
import { stripLeadingMaterialsMetaLines } from "@/lib/stripMaterialsMeta";
import "./long-image.css";

type StepRow = {
  id: string;
  step_number: number;
  step_name: string;
  description: string;
};

type LongImageSku = {
  id: string;
  name: string;
  description: string;
  level: string | null;
  materials_text: string | null;
  tools_text: string | null;
  display_level: string;
  display_creator_name: string;
  cover_hero_image_url: string | null;
};

const TAGLINE =
  "Scan the QR code next to each step to watch that moment in the video. No searching. No scrubbing. Just make.";

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

/** Materials/tools text is free-form; one item per line with common bullet prefixes stripped. */
function parseItemsFromText(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^[\s\u2022\u00b7\-\u2013\u2014*]+/u, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

/**
 * Column count for the steps grid. Spec pins 6→3 and 8→4. Other counts aim for
 * roughly two rows where it looks balanced.
 */
function stepsGridColumns(n: number): number {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 2;
  if (n === 5 || n === 6) return 3;
  return 4;
}

function StepCard({
  step,
  qrSrc
}: {
  step: StepRow;
  qrSrc: string;
}) {
  const paras = descriptionToParas(step.description);
  return (
    <div className="pmli-step">
      <div className="pmli-step-num">{formatStepNum(step.step_number)}</div>
      <div className="pmli-step-title">
        {stripLeadingStepNumberFromTitle(step.step_name)}
      </div>
      <div className="pmli-step-desc">
        {paras.length > 0
          ? paras.map((p, i) => <p key={i}>{p}</p>)
          : null}
      </div>
      <div className="pmli-qr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSrc} alt="" width={24} height={24} />
      </div>
    </div>
  );
}

export function LongImageView({
  sku,
  steps
}: {
  sku: LongImageSku;
  steps: StepRow[];
}) {
  const coverHeroSrc = sku.cover_hero_image_url?.trim() || "";
  const materialsBody = stripLeadingMaterialsMetaLines(
    sku.materials_text?.trim() ?? ""
  );
  const toolsBody = stripLeadingMaterialsMetaLines(
    sku.tools_text?.trim() ?? ""
  );
  const materialItems = parseItemsFromText(materialsBody);
  const toolItems = parseItemsFromText(toolsBody);
  const combinedItems = [...materialItems, ...toolItems];
  const hasMaterialsSection = combinedItems.length > 0;

  const stepCount = steps.length;
  const cols = stepsGridColumns(stepCount);
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, 1fr)` };

  const creator = sku.display_creator_name?.trim() || "the creator";

  return (
    <div className="pmli-root" id="pm-long-image-root">
      {/* Section 1: Cover image */}
      <div className="pmli-cover-image">
        {coverHeroSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverHeroSrc} alt="" />
        ) : (
          <div className="pmli-cover-image-fallback">
            <span>{sku.name}</span>
          </div>
        )}
      </div>

      {/* Section 2: Cover text */}
      <div className="pmli-cover-text">
        <div className="pmli-eyebrow">CROCHET GUIDE · LINKSYLLABUS.COM</div>
        <h1 className="pmli-title">{sku.name}</h1>
        <div className="pmli-byline">
          Tutorial by {creator} · Guide from linksyllabus.com
        </div>
        <div className="pmli-tags">
          <span className="pmli-tag pmli-tag-green">
            {stepCount} {stepCount === 1 ? "step" : "steps"}
          </span>
          <span className="pmli-tag pmli-tag-green">{sku.display_level}</span>
          {hasMaterialsSection ? (
            <span className="pmli-tag pmli-tag-gray">Materials &amp; tools included</span>
          ) : null}
          <span className="pmli-tag pmli-tag-gray">QR-linked steps</span>
        </div>
        <div className="pmli-tagline">{TAGLINE}</div>
      </div>

      {/* Section 3: Materials & Tools (optional) */}
      {hasMaterialsSection ? (
        <div className="pmli-materials">
          <div className="pmli-section-label">MATERIALS &amp; TOOLS</div>
          <div className="pmli-materials-list">
            {combinedItems.map((item, i) => (
              <div key={i} className="pmli-mat-item">
                <span className="pmli-mat-dot" />
                <span className="pmli-mat-text">{item}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Section 4: Steps */}
      <div className="pmli-steps">
        <div className="pmli-section-label">STEPS</div>
        {stepCount > 0 ? (
          <div className="pmli-steps-grid" style={gridStyle}>
            {steps.map((s) => (
              <StepCard
                key={s.id}
                step={s}
                qrSrc={`/api/qr/${encodeURIComponent(s.id)}`}
              />
            ))}
          </div>
        ) : (
          <div className="pmli-steps-empty">No steps yet.</div>
        )}
      </div>

      {/* Section 5: Footer */}
      <div className="pmli-footer">
        <span className="pmli-footer-left">linksyllabus.com</span>
        <span className="pmli-footer-right">
          {stepCount} {stepCount === 1 ? "step" : "steps"} · QR guide
        </span>
      </div>
    </div>
  );
}
