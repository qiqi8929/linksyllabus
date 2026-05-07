export const FREE_GUIDE_LIMIT = 1;

/** Total guides allowed = one free + each $9.99 unlock adds one slot. */
export function maxAllowedGuides(paidGuideSlots: number): number {
  const n = Math.floor(Number(paidGuideSlots));
  const slots = Number.isFinite(n) && n >= 0 ? n : 0;
  return FREE_GUIDE_LIMIT + slots;
}

export const FREE_TIER_UPGRADE_MESSAGE =
  "Guide limit reached. Pay $9.99 once to add another tutorial guide slot.";
