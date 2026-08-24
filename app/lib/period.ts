import { PeriodConfig } from "@/data/model/types";

export const DEFAULT_PERIOD_ID = "2025-2026";

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
