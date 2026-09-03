import { PeriodConfig } from "@/data/model/types";

/**
 * Calendar-year model.
 *
 * The dashboard operates on standard calendar years (January → December).
 * `calendarYearPeriod(year)` builds the PeriodConfig that drives every
 * existing calculation — the derived dashboard data (KPIs, monthly
 * income/outflow, cumulative growth, income stream stack, top outflows,
 * etc.) all filter by `startDate`/`endDate` and iterate `months`, so
 * switching the selected year automatically re-runs the real data.
 *
 * The `periods` array below is the internal seed-generation window used
 * by `app/data/seed.ts` to produce the sample dataset. It is intentionally
 * left untouched so the underlying financial data stays identical; it is
 * never rendered in the UI.
 */

/** Default selected calendar year. */
export const DEFAULT_YEAR = 2026;

export const DEFAULT_PERIOD_ID = "2025-2026";

export function calendarYearPeriod(year: number, currency = "USD"): PeriodConfig {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    id: `${year}`,
    label: `${year}`,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    months: Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`),
    currency,
  };
}

/**
 * Calendar years that actually contain transaction data, most recent
 * first. The selected year must always be one of these so the dashboard
 * only ever shows real, existing data.
 */
export function yearsWithData(
  transactions: Array<{ date: string }>,
  fallbackYear: number = DEFAULT_YEAR
): number[] {
  const years = new Set<number>();
  for (const t of transactions) {
    const y = Number(t.date.slice(0, 4));
    if (Number.isInteger(y) && y >= 1970 && y <= 2200) years.add(y);
  }
  const list = [...years].sort((a, b) => b - a);
  if (list.length === 0) list.push(fallbackYear);
  return list;
}

export const periods: PeriodConfig[] = [
  {
    id: "2025-2026",
    label: "Annual 2025 - 2026",
    startDate: "2025-07-01",
    endDate: "2026-06-30",
    months: [
      "2025-07","2025-08","2025-09","2025-10","2025-11","2025-12",
      "2026-01","2026-02","2026-03","2026-04","2026-05","2026-06",
    ],
    currency: "USD",
  },
  {
    id: "2024-2025",
    label: "Annual 2024 - 2025",
    startDate: "2024-07-01",
    endDate: "2025-06-30",
    months: [
      "2024-07","2024-08","2024-09","2024-10","2024-11","2024-12",
      "2025-01","2025-02","2025-03","2025-04","2025-05","2025-06",
    ],
    currency: "USD",
  },
];

export function getPeriodById(id: string): PeriodConfig | undefined {
  return periods.find((p) => p.id === id);
}
