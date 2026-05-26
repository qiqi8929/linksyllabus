export type MagicLogGrant = {
  id: string;
  title: string;
  amount: string;
  description: string;
  applyUrl: string;
};

/** Alberta apprentice grants (external application sites). */
export const ALBERTA_MAGICLOG_GRANTS: MagicLogGrant[] = [
  {
    id: "federal-apprenticeship-incentive",
    title: "Federal Apprenticeship Incentive Grant",
    amount: "Up to $4,000",
    description:
      "Federal grant for registered apprentices who complete their first and/or second year/level.",
    applyUrl:
      "https://www.canada.ca/en/employment-social-development/services/funding/apprenticeship-incentive-grant.html"
  },
  {
    id: "alberta-apprenticeship-award",
    title: "Alberta Apprenticeship and Industry Training Award",
    amount: "$1,000",
    description:
      "Provincial award for apprentices who demonstrate outstanding achievement in their trade program.",
    applyUrl: "https://tradesecrets.alberta.ca/apprentices-and-students/financial-assistance/"
  }
];

export function grantsForProvince(province: string | null | undefined): MagicLogGrant[] {
  const p = (province ?? "alberta").toLowerCase();
  if (p === "alberta") return ALBERTA_MAGICLOG_GRANTS;
  return [];
}
