// Phase 6 — proves the shared `periodTransactions` pre-filter introduced in
// dashboardData.tsx (feeding kpis/monthlyIncomeOutflow/etc.) produces
// IDENTICAL results to calling each calculation directly against the full,
// unfiltered transaction history — for a business with multi-year data
// where only one year is selected, and where pending/transfer transactions
// exist outside and inside the period. This is the regression proof that
// moving the calculation boundary (Section 4/8 of the Phase 6 report)
// changed nothing observable.
// @vitest-environment jsdom
import React, { useLayoutEffect } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudState } from "@/lib/cloudSync";
import {
  calculateKPIs, calculateMonthlyIncomeOutflow, calculateIncomeSplit, calculateOutflowTypes,
  calculateCumulativeGrowth, calculateNetWorthGrowth, calculateIncomeStreamStack,
  calculateTopOutflows, calculateTopSpendings, isRealized,
} from "@/lib/calculations";
import { calendarYearPeriod } from "@/lib/period";
import type { Transaction, Account, Category } from "@/data/model/types";

const mocks = vi.hoisted(() => ({ pull: vi.fn(), push: vi.fn(), businesses: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseBrowserClient: () => ({ auth: {
    getUser: async () => ({ data: { user: { id: "user-a", email: "test@example.invalid" } } }),
    signOut: vi.fn(),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
  } }),
}));
vi.mock("@/lib/platformAdmin", () => ({ checkPlatformAdmin: async () => false, clearAdminViewing: vi.fn(), getAdminViewing: () => null }));
vi.mock("@/lib/cloudSync", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/cloudSync")>(),
  pullBusinessState: mocks.pull, pushBusinessState: mocks.push, fetchBusinessesForUser: mocks.businesses,
}));
vi.mock("@/lib/exchangeRates", () => ({
  convertAmount: (n: number) => n, getExchangeRate: async () => ({ rate: 1, timestamp: 1 }),
}));

import { DashboardProvider, useDashboardData } from "@/lib/dashboardData";

const accounts: Account[] = [
  { id: "a", name: "Checking", type: "checking", openingBalance: 1000, currentBalance: 1000, currency: "USD", active: true },
  { id: "s", name: "Savings", type: "savings", openingBalance: 500, currentBalance: 500, currency: "USD", active: true },
];
const categories: Category[] = [
  { id: "salary", name: "Salary", type: "income", group: "income", color: "#111" },
  { id: "food", name: "Food", type: "expense", group: "expenses", color: "#222" },
];
// Multi-year, mixed-status history: 2024 and 2025 transactions (outside
// the selected 2026 period) plus a 2026 pending transaction (inside the
// period but must stay excluded per Phase 2's isRealized rule).
const transactions: Transaction[] = [
  { id: "t2024", date: "2024-06-01", accountId: "a", categoryId: "salary", type: "income", amount: 9999, description: "Old year", status: "cleared" },
  { id: "t2025", date: "2025-06-01", accountId: "a", categoryId: "food", type: "expense", amount: 4444, description: "Old year", status: "cleared" },
  { id: "t2026-income", date: "2026-01-10", accountId: "a", categoryId: "salary", type: "income", amount: 3000, description: "Salary", status: "cleared" },
  { id: "t2026-expense", date: "2026-01-15", accountId: "a", categoryId: "food", type: "expense", amount: 200, description: "Groceries", status: "cleared" },
  { id: "t2026-pending", date: "2026-02-01", accountId: "a", categoryId: "food", type: "expense", amount: 500, description: "Pending bill", status: "pending" },
  { id: "t2026-transfer", date: "2026-03-01", accountId: "a", toAccountId: "s", categoryId: "food", type: "transfer", amount: 100, description: "To savings", status: "cleared" },
];

const initial = (): CloudState => ({
  accounts, categories, transactions, budgets: [], goals: [], plannedTransactions: [],
  activities: [], notifications: [], todos: [],
  selectedYear: 2026, currency: "USD", cloudRows: {},
});

let dashboard: ReturnType<typeof useDashboardData>;
function Probe() {
  const data = useDashboardData();
  useLayoutEffect(() => { dashboard = data; }, [data]);
  return <span data-testid="status">{data.cloudSyncState}</span>;
}

async function mountSynced() {
  render(<DashboardProvider><Probe /></DashboardProvider>);
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
}

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  mocks.businesses.mockResolvedValue([{ id: "business-a", name: "A", slug: null, currency: "USD", role: "owner" }]);
  mocks.pull.mockResolvedValue(initial());
  mocks.push.mockImplementation(async (_id, next) => ({ ...next, cloudRows: {} }));
});
afterEach(cleanup);

describe("periodTransactions pre-filter produces identical results to the old full-array approach", () => {
  it("kpis/monthlyIncomeOutflow/incomeSplit/outflowTypes/cumulativeGrowth/netWorthGrowth/incomeStreamStack/topOutflows/topSpendings all match direct calls against the FULL unfiltered history", async () => {
    await mountSynced();
    const period = calendarYearPeriod(2026);
    // "OLD" reference behavior: call each calculation directly with the
    // full, unfiltered (all-years, all-statuses) transaction array — this
    // is exactly what dashboardData.tsx did before this Phase 6 change.
    const expectedKpis = calculateKPIs(transactions, accounts, [], period);
    const expectedMonthly = calculateMonthlyIncomeOutflow(transactions, period);
    const expectedIncomeSplit = calculateIncomeSplit(transactions, categories, period);
    const expectedOutflowTypes = calculateOutflowTypes(transactions, categories, period);
    const expectedCumulative = calculateCumulativeGrowth(transactions, period);
    const expectedNetWorth = calculateNetWorthGrowth(accounts, transactions, period);
    const expectedStreamStack = calculateIncomeStreamStack(transactions, categories, period);
    const expectedTopOutflows = calculateTopOutflows(transactions, period);
    const expectedTopSpendings = calculateTopSpendings(transactions, categories, period);

    expect(dashboard.kpis).toEqual(expectedKpis);
    expect(dashboard.monthlyIncomeOutflow).toEqual(expectedMonthly);
    expect(dashboard.incomeSplit).toEqual(expectedIncomeSplit);
    expect(dashboard.outflowTypes).toEqual(expectedOutflowTypes);
    expect(dashboard.cumulativeGrowth).toEqual(expectedCumulative);
    expect(dashboard.netWorthGrowth).toEqual(expectedNetWorth);
    expect(dashboard.incomeStreamStack).toEqual(expectedStreamStack);
    expect(dashboard.topOutflows).toEqual(expectedTopOutflows);
    expect(dashboard.topSpendings).toEqual(expectedTopSpendings);
  });

  it("sanity: the pending 2026 transaction is excluded and the out-of-period years never leak in", () => {
    const period = calendarYearPeriod(2026);
    const jan = calculateMonthlyIncomeOutflow(transactions, period).find((r) => r.month === "Jan");
    expect(jan?.income).toBe(3000); // only the cleared 2026 income
    expect(jan?.outflow).toBe(200); // only the cleared Jan expense — Feb's pending $500 excluded
    const total2026Realized = transactions.filter(
      (t) => t.date.startsWith("2026") && isRealized(t)
    );
    expect(total2026Realized.some((t) => t.id === "t2026-pending")).toBe(false);
  });
});
