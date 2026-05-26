export const MAGICLOG_PROVINCES = [
  { id: "alberta", label: "Alberta (AIT)", available: true },
  { id: "bc", label: "British Columbia", available: false },
  { id: "ontario", label: "Ontario", available: false }
] as const;

/** Trades with compulsory certification (Alberta AIT hour targets apply automatically). */
export const MAGICLOG_COMPULSORY_TRADES = [
  "Electrician",
  "Plumber",
  "Welder",
  "Pipefitter"
] as const;

export const MAGICLOG_OPTIONAL_TRADES = [
  "Carpenter",
  "Heavy Equipment Technician",
  "Other"
] as const;

export const MAGICLOG_TRADES = [
  ...MAGICLOG_COMPULSORY_TRADES,
  ...MAGICLOG_OPTIONAL_TRADES
] as const;

export function isCompulsoryCertificationTrade(trade: string | null | undefined): boolean {
  if (!trade) return false;
  return (MAGICLOG_COMPULSORY_TRADES as readonly string[]).includes(trade);
}

export type PeriodRequirements = {
  hoursRequired: number;
  mandatoryRequired: number;
  optionalRequired: number;
};

const DEFAULT_PERIOD_REQUIREMENTS: Record<number, PeriodRequirements> = {
  1: { hoursRequired: 1500, mandatoryRequired: 7, optionalRequired: 0 },
  2: { hoursRequired: 1500, mandatoryRequired: 8, optionalRequired: 6 },
  3: { hoursRequired: 1500, mandatoryRequired: 8, optionalRequired: 6 },
  4: { hoursRequired: 1500, mandatoryRequired: 8, optionalRequired: 6 }
};

/** Electrician Alberta AIT-style period targets (other compulsory trades use same until expanded). */
const ELECTRICIAN_PERIOD_REQUIREMENTS: Record<number, PeriodRequirements> = {
  1: { hoursRequired: 1500, mandatoryRequired: 7, optionalRequired: 0 },
  2: { hoursRequired: 1500, mandatoryRequired: 8, optionalRequired: 6 },
  3: { hoursRequired: 1500, mandatoryRequired: 8, optionalRequired: 6 },
  4: { hoursRequired: 1500, mandatoryRequired: 8, optionalRequired: 6 }
};

const PLUMBER_PERIOD_REQUIREMENTS: Record<number, PeriodRequirements> = {
  1: { hoursRequired: 1560, mandatoryRequired: 7, optionalRequired: 0 },
  2: { hoursRequired: 1560, mandatoryRequired: 8, optionalRequired: 6 },
  3: { hoursRequired: 1560, mandatoryRequired: 8, optionalRequired: 6 },
  4: { hoursRequired: 1560, mandatoryRequired: 8, optionalRequired: 6 }
};

export const PERIOD_REQUIREMENTS_BY_TRADE: Record<string, Record<number, PeriodRequirements>> =
  {
    Electrician: ELECTRICIAN_PERIOD_REQUIREMENTS,
    Plumber: PLUMBER_PERIOD_REQUIREMENTS,
    Welder: DEFAULT_PERIOD_REQUIREMENTS,
    Pipefitter: DEFAULT_PERIOD_REQUIREMENTS,
    Carpenter: DEFAULT_PERIOD_REQUIREMENTS,
    "Heavy Equipment Technician": DEFAULT_PERIOD_REQUIREMENTS,
    Other: DEFAULT_PERIOD_REQUIREMENTS
  };

/** @deprecated Use getPeriodRequirements(period, profile) */
export const PERIOD_REQUIREMENTS = DEFAULT_PERIOD_REQUIREMENTS;

export function getPeriodRequirementsForTrade(
  trade: string | null | undefined,
  period: number
): PeriodRequirements {
  const key = trade?.trim() || "Other";
  const map = PERIOD_REQUIREMENTS_BY_TRADE[key] ?? DEFAULT_PERIOD_REQUIREMENTS;
  return map[period] ?? map[1] ?? DEFAULT_PERIOD_REQUIREMENTS[1];
}

export const magiclog_subscription = {
  trialDays: 30,
  monthlyUsd: 19.99
} as const;

/** Alberta apprentice portal for period-end document upload. */
export const AIT_MYTRADESECRETS_URL =
  "https://tradesecrets.alberta.ca/mytradesecrets/";
