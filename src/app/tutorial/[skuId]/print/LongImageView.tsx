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
  /** Manual override (creator_name field). */
  creator_name: string | null;
  /** Auto-populated from YouTube imports (channel name). */
  author: string | null;
  cover_hero_image_url: string | null;
};

const TAGLINE =
  "Scan the QR code next to each step to watch that moment in the video. No searching. No scrubbing. Just make.";

/**
 * Heuristic only for the long-image export (no DB field). Prefer crochet when
 * the title/description clearly describe yarn work; otherwise treat strong
 * cooking/recipe signals as a recipe guide.
 */
function inferLongImageRecipeGuide(sku: LongImageSku): boolean {
  const name = (sku.name ?? "").toLowerCase();
  const desc = (sku.description ?? "").toLowerCase();
  const matRaw = stripLeadingMaterialsMetaLines(
    (sku.materials_text ?? "").trim()
  ).toLowerCase();
  const toolsRaw = stripLeadingMaterialsMetaLines(
    (sku.tools_text ?? "").trim()
  ).toLowerCase();
  const head = `${name}\n${desc}`;
  const blob = `${head}\n${matRaw}\n${toolsRaw}`;

  const crochetDominant =
    /\b(crochet|amigurumi|yarn(?:\s|$|,|weight)|crochet hook|knitting needles?|granny square|magic ring| slip stitch|single crochet|double crochet|half double| hdc\b|\bsc\b|\bdc\b|stitch count|round\s+\d+)\b/i.test(
      head
    );

  const recipeLex =
    /\b(recipe|how to cook|cooking tutorial|bake(?:d|r|s)?|baking|in the oven|preheat|tablespoon|teaspoon|\btsp\b|\btbsp\b|simmer|bring to a boil|saut[eé]|marinate|brais(e|ed)|broil|grill(?:ing)?|meal prep|pastry|frosting|icing|sous vide|slow cooker|instant pot|air fryer|wok\b|julienne| mise en place)\b/i.test(
      blob
    );

  const foodInMaterials =
    /\b(flour|sugar|butter|salt|pepper|olive oil|vegetable oil|garlic|onion|chicken|beef|pork|fish|egg[s]?|milk|cream|cheese|tomato|potato|carrot|rice|pasta|noodle|broth|stock|soy sauce|vinegar|yeast|baking powder|baking soda|heavy cream|all[- ]purpose flour)\b/i.test(
      matRaw
    );
  const measuresInMaterials =
    /\b(\d+\s*(tsp|tbsp|cup|cups|g|grams?|ml|oz|lb|lbs|pound|tablespoon|teaspoon)|\d+\/\d+\s*cup)\b/i.test(
      matRaw
    );
  const recipeFromIngredients = foodInMaterials && measuresInMaterials;

  if (crochetDominant && !recipeLex && !recipeFromIngredients) {
    return false;
  }
  if (recipeLex || recipeFromIngredients) {
    return true;
  }
  if (
    /\b(cook(ing)?|recipe|kitchen|food)\b/i.test(head) &&
    !crochetDominant
  ) {
    return true;
  }
  return false;
}

/**
 * YouTube `hqdefault.jpg` is 480×360 (4:3) and includes black letterbox bars
 * on the top and bottom of the actual content. We swap to `mqdefault.jpg`
 * (320×180, 16:9, no letterboxing) for the long image so the cover renders
 * cleanly without object-fit cropping artifacts. The PDF path keeps using
 * `hqdefault.jpg` — this transformation is scoped to the long image only.
 */
function preferCleanThumbForLongImage(url: string): string {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.toLowerCase();
  const isYouTubeThumbHost =
    host === "img.youtube.com" ||
    host === "i.ytimg.com" ||
    host.endsWith(".ytimg.com");
  if (!isYouTubeThumbHost) return url;
  if (parsed.pathname.endsWith("/hqdefault.jpg")) {
    parsed.pathname = parsed.pathname.replace(
      /\/hqdefault\.jpg$/,
      "/mqdefault.jpg"
    );
    return parsed.toString();
  }
  return url;
}

/** Best creator/channel name from the guide row, or null when we have neither. */
function resolveBylineCreator(sku: LongImageSku): string | null {
  const explicit = sku.creator_name?.trim();
  if (explicit) return explicit;
  const channel = sku.author?.trim();
  if (channel) return channel;
  return null;
}

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

function MaterialsItemsList({ items }: { items: string[] }) {
  return (
    <div className="pmli-materials-list">
      {items.map((item, i) => (
        <div key={i} className="pmli-mat-item">
          <span className="pmli-mat-dot" />
          <span className="pmli-mat-text">{item}</span>
        </div>
      ))}
    </div>
  );
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
  const rawCoverSrc = sku.cover_hero_image_url?.trim() || "";
  const coverHeroSrc = preferCleanThumbForLongImage(rawCoverSrc);
  const materialsBody = stripLeadingMaterialsMetaLines(
    sku.materials_text?.trim() ?? ""
  );
  const toolsBody = stripLeadingMaterialsMetaLines(
    sku.tools_text?.trim() ?? ""
  );
  const materialItems = parseItemsFromText(materialsBody);
  const toolItems = parseItemsFromText(toolsBody);
  const combinedItems = [...materialItems, ...toolItems];
  const isRecipe = inferLongImageRecipeGuide(sku);
  const hasMaterialsSection = combinedItems.length > 0;
  const hasIngredientsBlock = materialItems.length > 0;
  const hasToolsBlock = toolItems.length > 0;
  const showRecipeMaterials =
    isRecipe && (hasIngredientsBlock || hasToolsBlock);
  const showCraftMaterials =
    !isRecipe && hasMaterialsSection;

  const stepCount = steps.length;
  const cols = stepsGridColumns(stepCount);
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, 1fr)` };

  const bylineCreator = resolveBylineCreator(sku);
  const eyebrowKind = isRecipe ? "RECIPE GUIDE" : "CROCHET GUIDE";

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
        <div className="pmli-eyebrow">
          {eyebrowKind} · LINKSYLLABUS.COM
        </div>
        <h1 className="pmli-title">{sku.name}</h1>
        {bylineCreator ? (
          <div className="pmli-byline">
            Tutorial by {bylineCreator} · Guide from linksyllabus.com
          </div>
        ) : null}
        <div className="pmli-tags">
          <span className="pmli-tag pmli-tag-green">
            {stepCount} {stepCount === 1 ? "step" : "steps"}
          </span>
          <span className="pmli-tag pmli-tag-green">{sku.display_level}</span>
          {showRecipeMaterials || showCraftMaterials ? (
            <span className="pmli-tag pmli-tag-gray">
              {isRecipe
                ? "Ingredients & tools included"
                : "Materials & tools included"}
            </span>
          ) : null}
          <span className="pmli-tag pmli-tag-gray">QR-linked steps</span>
        </div>
        <div className="pmli-tagline">{TAGLINE}</div>
      </div>

      {/* Section 3: Materials / ingredients (optional) */}
      {showRecipeMaterials ? (
        <div className="pmli-materials">
          {hasIngredientsBlock ? (
            <div className="pmli-materials-sub">
              <div className="pmli-section-label">INGREDIENTS</div>
              <MaterialsItemsList items={materialItems} />
            </div>
          ) : null}
          {hasToolsBlock ? (
            <div
              className={`pmli-materials-sub${hasIngredientsBlock ? " pmli-materials-sub-after" : ""}`}
            >
              <div className="pmli-section-label">TOOLS</div>
              <MaterialsItemsList items={toolItems} />
            </div>
          ) : null}
        </div>
      ) : showCraftMaterials ? (
        <div className="pmli-materials">
          <div className="pmli-section-label">MATERIALS &amp; TOOLS</div>
          <MaterialsItemsList items={combinedItems} />
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
