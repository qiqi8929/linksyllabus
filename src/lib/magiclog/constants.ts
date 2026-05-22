export const BLUEBOOK_PROVINCES = [
  { id: "alberta", label: "Alberta (AIT)", available: true },
  { id: "bc", label: "British Columbia", available: false },
  { id: "ontario", label: "Ontario", available: false }
] as const;

export const BLUEBOOK_TRADES = [
  "Electrician",
  "Plumber",
  "Welder",
  "Pipefitter",
  "Carpenter",
  "Heavy Equipment Technician",
  "Other"
] as const;

export type PeriodRequirements = {
  hoursRequired: number;
  mandatoryRequired: number;
  optionalRequired: number;
};

/**
 * Alberta AIT MVP placeholders (Electrician Period 1 ≈ min 7 competences).
 * Trade-specific targets will replace these later.
 */
export const PERIOD_REQUIREMENTS: Record<number, PeriodRequirements> = {
  1: { hoursRequired: 1500, mandatoryRequired: 7, optionalRequired: 0 },
  2: { hoursRequired: 1500, mandatoryRequired: 8, optionalRequired: 6 },
  3: { hoursRequired: 1500, mandatoryRequired: 8, optionalRequired: 6 },
  4: { hoursRequired: 1500, mandatoryRequired: 8, optionalRequired: 6 }
};

export const BLUEBOOK_SUBSCRIPTION = {
  trialDays: 30,
  monthlyUsd: 19.99
} as const;

/** Alberta apprentice portal for period-end document upload. */
export const AIT_MYTRADESECRETS_URL =
  "https://tradesecrets.alberta.ca/mytradesecrets/";
