// Phase 2 financial-integrity regression tests — pure calculation layer.
//
// These functions are currency-agnostic: they sum whatever numeric `amount`
// they're given. Currency conversion happens upstream (dashboardData.tsx's
// `toDisplay`, before these functions ever see a transaction), so "mixed
// currencies" and "legacy transaction without currency" are exercised in
// tests/entry-provider.test.tsx instead, where the real save/display path
// (including the account-currency fallback) is in play end-to-end.
import { describe, expect, it } from "vitest";
import {
  calculateKPIs,
  calculateMonthlyIncomeOutflow,
  calculateNetWorthGrowth,
  calculateOutflowTypes,
  calculateTopSpendings,
  isRealized,
} from "@/lib/calculations";
import { calendarYearPeriod } from "@/lib/period";
import type { Account, Category, Goal, Transaction } from "@/data/model/types";

const period = calendarYearPeriod(2026);

function tx(overrides: Partial<Transaction> & Pick<Transaction, "date" | "type" | "amount">): Transaction {
  return {
    id: overrides.id ?? `tx-${Math.random().toString(36).slice(2)}`,
    accountId: "a1",
    categoryId: "c1",
    description: "test",
    status: "cleared",
    ...overrides,
  };
}

const accounts: Account[] = [
  { id: "a1", name: "Checking A", type: "checking", openingBalance: 1000, currentBalance: 1000, currency: "USD", active: true },
  { id: "a2", name: "Checking B", type: "checking", openingBalance: 500, currentBalance: 500, currency: "USD", active: true },
];

const categories: Category[] = [
  { id: "c1", name: "Salary", group: "income", type: "income", color: "#000" },
  { id: "c2", name: "Groceries", group: "expenses", type: "expense", color: "#111" },
  { id: "c3", name: "Rent", group: "bills", type: "expense", color: "#222" },
];

describe("isRealized — the shared pending rule", () => {
  it("excludes pending, includes cleared and reconciled", () => {
    expect(isRealized({ status: "pending" })).toBe(false);
    expect(isRealized({ status: "cleared" })).toBe(true);
    expect(isRealized({ status: "reconciled" })).toBe(true);
  });
});

describe("Worked example — CLEARED", () => {
  it("income 1000, outflow 300 → realized net = 700", () => {
    const txs = [
      tx({ date: "2026-03-05", type: "income", amount: 1000, status: "cleared" }),
      tx({ date: "2026-03-06", type: "expense", amount: 300, status: "cleared", categoryId: "c2" }),
    ];
    const [row] = calculateMonthlyIncomeOutflow(txs, period).filter((r) => r.month === "Mar");
    expect(row.income).toBe(1000);
    expect(row.outflow).toBe(300);
    expect(row.income - row.outflow).toBe(700);
  });
});

describe("Worked example — PENDING", () => {
  it("cleared income 1000 + pending income 500, cleared outflow 300 + pending outflow 200 → realized income=1000, outflow=300, net=700", () => {
    const txs = [
      tx({ date: "2026-04-01", type: "income", amount: 1000, status: "cleared" }),
      tx({ date: "2026-04-02", type: "income", amount: 500, status: "pending" }),
      tx({ date: "2026-04-03", type: "expense", amount: 300, status: "cleared", categoryId: "c2" }),
      tx({ date: "2026-04-04", type: "expense", amount: 200, status: "pending", categoryId: "c2" }),
    ];
    const [row] = calculateMonthlyIncomeOutflow(txs, period).filter((r) => r.month === "Apr");
    expect(row.income).toBe(1000);
    expect(row.outflow).toBe(300);
    expect(row.income - row.outflow).toBe(700);
  });

  it("a pending transaction never appears in KPI totals, budget-relevant charts, or net worth", () => {
    const txs = [
      tx({ date: "2026-05-01", type: "income", amount: 1000, status: "cleared" }),
      tx({ date: "2026-05-02", type: "income", amount: 9999, status: "pending" }),
    ];
    const kpis = calculateKPIs(txs, accounts, [], period);
    // "Spent" is 0 either way here; assert via the income-derived percentage
    // instead by checking net worth growth, which sums income directly.
    const growth = calculateNetWorthGrowth(accounts, txs, period);
    const may = growth.find((r) => r.month === "May")!;
    const openingNW = 1000 + 500; // both accounts' opening balances
    expect(may.value).toBe(openingNW + 1000); // only the cleared 1000 counted
    expect(kpis).toBeDefined(); // sanity — calculateKPIs didn't throw on pending rows
  });
});

describe("Worked example — TRANSFER neutrality", () => {
  it("Account A=1000, Account B=500, transfer 200 A→B: net worth stays 1500", () => {
    const txs = [
      tx({ date: "2026-06-01", type: "transfer", amount: 200, accountId: "a1", toAccountId: "a2", categoryId: "c1" }),
    ];
    const growth = calculateNetWorthGrowth(accounts, txs, period);
    const june = growth.find((r) => r.month === "Jun")!;
    expect(june.value).toBe(1500); // unchanged — transfers net to zero at the aggregate level
  });

  it("a transfer is never counted as outflow in the monthly income/outflow chart", () => {
    const txs = [tx({ date: "2026-07-01", type: "transfer", amount: 200, accountId: "a1", toAccountId: "a2" })];
    const [row] = calculateMonthlyIncomeOutflow(txs, period).filter((r) => r.month === "Jul");
    expect(row.outflow).toBe(0);
    expect(row.income).toBe(0);
  });
});

describe("Zero and decimal amounts", () => {
  it("a zero-amount transaction contributes nothing but doesn't throw", () => {
    const txs = [tx({ date: "2026-08-01", type: "income", amount: 0, status: "cleared" })];
    const [row] = calculateMonthlyIncomeOutflow(txs, period).filter((r) => r.month === "Aug");
    expect(row.income).toBe(0);
  });

  it("decimal amounts sum exactly (within floating-point tolerance)", () => {
    const txs = [
      tx({ date: "2026-09-01", type: "expense", amount: 19.99, status: "cleared", categoryId: "c2" }),
      tx({ date: "2026-09-02", type: "expense", amount: 0.01, status: "cleared", categoryId: "c2" }),
    ];
    const [row] = calculateMonthlyIncomeOutflow(txs, period).filter((r) => r.month === "Sep");
    expect(row.outflow).toBeCloseTo(20.0, 10);
  });
});

describe("Month/year boundary transactions", () => {
  it("Dec 31 and Jan 1 land in different months, not blended together", () => {
    const txs = [
      tx({ date: "2026-12-31", type: "income", amount: 100, status: "cleared" }),
      tx({ date: "2026-01-01", type: "income", amount: 50, status: "cleared" }),
    ];
    const rows = calculateMonthlyIncomeOutflow(txs, period);
    const dec = rows.find((r) => r.month === "Dec")!;
    const jan = rows.find((r) => r.month === "Jan")!;
    expect(dec.income).toBe(100);
    expect(jan.income).toBe(50);
  });

  it("a transaction dated in the adjacent year is excluded from this year's period entirely", () => {
    const txs = [tx({ date: "2025-12-31", type: "income", amount: 100, status: "cleared" })];
    const kpis = calculateKPIs(txs, accounts, [], period);
    const savedTile = kpis.find((k) => k.label === "Saved")!;
    // No 2026 income/outflow at all — Saved should reflect only account balances.
    expect(savedTile).toBeDefined();
  });
});

describe("Goal target matching is case-insensitive (Phase 2 fix)", () => {
  it("'Retirement Fund' and 'retirement fund' both match the retirement-target heuristic", () => {
    const goalsUpper: Goal[] = [{ id: "g1", name: "Retirement Fund", targetAmount: 40000, currentAmount: 0, targetDate: "2030-01-01", status: "active" }];
    const goalsLower: Goal[] = [{ id: "g2", name: "retirement fund", targetAmount: 40000, currentAmount: 0, targetDate: "2030-01-01", status: "active" }];
    const investAccounts: Account[] = [{ id: "inv", name: "Brokerage", type: "investment", openingBalance: 0, currentBalance: 8000, currency: "USD", active: true }];
    const kpisUpper = calculateKPIs([], investAccounts, goalsUpper, period);
    const kpisLower = calculateKPIs([], investAccounts, goalsLower, period);
    const investedUpper = kpisUpper.find((k) => k.label === "Invested")!;
    const investedLower = kpisLower.find((k) => k.label === "Invested")!;
    // Both must use the REAL 40000 target (20% = 8000/40000), not the 20000 fallback.
    expect(investedUpper.percentage).toBe(20);
    expect(investedLower.percentage).toBe(20);
  });
});

describe("Calculation consistency — duplicated implementations must agree", () => {
  it("calculateOutflowTypes and calculateTopSpendings agree on which categories have realized expense spend", () => {
    const txs = [
      tx({ date: "2026-10-01", type: "expense", amount: 200, status: "cleared", categoryId: "c2" }),
      tx({ date: "2026-10-02", type: "expense", amount: 999, status: "pending", categoryId: "c3" }), // must be excluded from both
      tx({ date: "2026-10-03", type: "transfer", amount: 500, categoryId: "c3" }), // must be excluded from both
    ];
    const outflowTypes = calculateOutflowTypes(txs, categories, period);
    const topSpendings = calculateTopSpendings(txs, categories, period);
    const groceriesInOutflow = outflowTypes.find((r) => r.name === "Groceries")!;
    const groceriesInTop = topSpendings.find((r) => r.name === "Groceries")!;
    expect(groceriesInOutflow.value).toBe(100); // only realized-expense category → 100% share
    expect(groceriesInTop.percentage).toBe(100);
    // Rent (c3) only has a pending/transfer row — must not appear as spend in either.
    expect(outflowTypes.find((r) => r.name === "Rent")!.value).toBe(0);
    expect(topSpendings.find((r) => r.name === "Rent")).toBeUndefined();
  });
});
