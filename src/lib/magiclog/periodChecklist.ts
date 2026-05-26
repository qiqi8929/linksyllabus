export type PeriodChecklistItem = {
  key: string;
  label: string;
  completed: boolean;
};

export const DEFAULT_PERIOD_CHECKLIST: PeriodChecklistItem[] = [
  {
    key: "period_exam",
    label: "Period technical exam completed",
    completed: false
  },
  {
    key: "attendance_80",
    label: "Classroom attendance at least 80%",
    completed: false
  },
  {
    key: "employer_review",
    label: "Employer / sponsor period review completed",
    completed: false
  }
];

export function parseChecklistJson(raw: unknown): PeriodChecklistItem[] {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_PERIOD_CHECKLIST.map((i) => ({ ...i }));
  }
  const record = raw as Record<string, boolean>;
  return DEFAULT_PERIOD_CHECKLIST.map((item) => ({
    ...item,
    completed: Boolean(record[item.key])
  }));
}

export function checklistToJson(items: PeriodChecklistItem[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const item of items) {
    out[item.key] = item.completed;
  }
  return out;
}
