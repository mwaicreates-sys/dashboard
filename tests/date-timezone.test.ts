// Phase 6 — date/timezone correctness fixes.
//
// 1. Chart month labels ("Jan".."Dec") used to come from
//    `new Date(month + "-01").toLocaleString(...)`, which parses a
//    date-only ISO string as UTC MIDNIGHT, then formats it in the
//    VIEWER'S LOCAL timezone. For any timezone west of UTC (all of the
//    Americas), that silently shifts every chart month label back by one
//    (e.g. "2026-01" rendered as "Dec"). Fixed by indexing the month
//    straight out of the "YYYY-MM" key (timezone-independent).
// 2. DEFAULT_YEAR was a hardcoded literal (2026) instead of the real
//    current year — a business with no data/selection would silently get
//    stuck on a stale year once the calendar moved past it.
import { describe, it, expect } from "vitest";
import {
  calculateMonthlyIncomeOutflow,
  calculateCumulativeGrowth,
  calculateNetWorthGrowth,
} from "@/lib/calculations";
import { calendarYearPeriod, DEFAULT_YEAR } from "@/lib/period";
import type { Transaction, Account } from "@/data/model/types";

const period = calendarYearPeriod(2026);

describe("chart month labels are timezone-independent (no UTC-parsing drift)", () => {
  it("calculateMonthlyIncomeOutflow labels January as 'Jan', not 'Dec'", () => {
    const rows = calculateMonthlyIncomeOutflow([], period);
    expect(rows[0].month).toBe("Jan");
    expect(rows[11].month).toBe("Dec");
    expect(rows.map((r) => r.month)).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
  });

  it("calculateCumulativeGrowth labels every month correctly in order", () => {
    const rows = calculateCumulativeGrowth([], period);
    expect(rows.map((r) => r.month)).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
  });

  it("calculateNetWorthGrowth labels every month correctly in order", () => {
    const accounts: Account[] = [
      { id: "a", name: "Cash", type: "checking", openingBalance: 100, currentBalance: 100, currency: "USD", active: true },
    ];
    const rows = calculateNetWorthGrowth(accounts, [], period);
    expect(rows.map((r) => r.month)).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
  });

  it("a transaction dated the 1st of the month is still attributed to that month's label", () => {
    // The exact edge the bug hit hardest: the 1st of the month at
    // "midnight" is where UTC-vs-local parsing diverges most.
    const tx: Transaction[] = [
      { id: "t1", date: "2026-01-01", accountId: "a", categoryId: "c", type: "income", amount: 500, description: "Salary", status: "cleared" },
    ];
    const rows = calculateMonthlyIncomeOutflow(tx, period);
    const jan = rows.find((r) => r.month === "Jan");
    expect(jan?.income).toBe(500);
  });
});

describe("DEFAULT_YEAR reflects the real current year, not a hardcoded literal", () => {
  it("equals the system's current calendar year", () => {
    expect(DEFAULT_YEAR).toBe(new Date().getFullYear());
  });
});
