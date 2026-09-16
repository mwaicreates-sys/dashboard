// Phase 5 — budget CRUD + spend calculation through the real provider
// mutators (the same API BudgetsSection calls). Harness mirrors
// tests/mutation-durability.test.tsx.
// @vitest-environment jsdom
import React, { useLayoutEffect } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudState } from "@/lib/cloudSync";

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

const initial = (): CloudState => ({
  accounts: [{ id: "a", name: "Cash", type: "checking", openingBalance: 1000, currentBalance: 1000, currency: "USD", active: true }],
  categories: [{ id: "c", name: "Groceries", type: "expense", group: "expenses", color: "#112233" }],
  transactions: [
    { id: "t1", date: "2026-01-05", accountId: "a", categoryId: "c", type: "expense", amount: 40, description: "Cleared groceries", status: "cleared" },
    { id: "t2", date: "2026-01-10", accountId: "a", categoryId: "c", type: "expense", amount: 999, description: "Pending groceries", status: "pending" },
  ],
  budgets: [],
  goals: [], plannedTransactions: [], activities: [], notifications: [], todos: [],
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

describe("budgets", () => {
  it("creating a budget for a category with EXISTING cleared spend immediately reflects that spend (not $0 until an unrelated tx event)", async () => {
    await mountSynced();
    await act(async () => {
      await dashboard.addBudget({ categoryId: "c", periodId: "2026-01", month: "2026-01", plannedAmount: 100, actualAmount: 0 });
    });
    const b = dashboard.budgets.find((x) => x.categoryId === "c");
    expect(b?.actualAmount).toBe(40); // only the cleared $40, not the pending $999
  });

  it("pending transactions are excluded from budget spend, consistent with the Phase 2 rule", async () => {
    await mountSynced();
    await act(async () => {
      await dashboard.addBudget({ categoryId: "c", periodId: "2026-01", month: "2026-01", plannedAmount: 100, actualAmount: 0 });
    });
    const b = dashboard.budgets.find((x) => x.categoryId === "c");
    expect(b?.actualAmount).not.toBe(1039); // would be 40+999 if pending were wrongly included
  });

  it("editing a budget's planned amount persists and does not disturb its computed actual", async () => {
    await mountSynced();
    await act(async () => {
      await dashboard.addBudget({ categoryId: "c", periodId: "2026-01", month: "2026-01", plannedAmount: 100, actualAmount: 0 });
    });
    const id = dashboard.budgets.find((x) => x.categoryId === "c")!.id;
    await act(async () => { await dashboard.updateBudget(id, { plannedAmount: 250 }); });
    const b = dashboard.budgets.find((x) => x.id === id);
    expect(b?.plannedAmount).toBe(250);
    expect(b?.actualAmount).toBe(40);
  });

  it("deleting a budget removes it and persists the removal", async () => {
    await mountSynced();
    await act(async () => {
      await dashboard.addBudget({ categoryId: "c", periodId: "2026-01", month: "2026-01", plannedAmount: 100, actualAmount: 0 });
    });
    const id = dashboard.budgets.find((x) => x.categoryId === "c")!.id;
    await act(async () => { await dashboard.deleteBudget(id); });
    expect(dashboard.budgets.some((b) => b.id === id)).toBe(false);
    const pushed = mocks.push.mock.calls.at(-1)?.[1] as CloudState;
    expect(pushed.budgets.some((b) => b.id === id)).toBe(false);
  });

  it("a newly cleared transaction after budget creation updates the budget's actual on the next mutation", async () => {
    await mountSynced();
    await act(async () => {
      await dashboard.addBudget({ categoryId: "c", periodId: "2026-01", month: "2026-01", plannedAmount: 100, actualAmount: 0 });
    });
    await act(async () => {
      await dashboard.addTransaction({
        date: "2026-01-20", accountId: "a", categoryId: "c", type: "expense",
        amount: 15, description: "More groceries", status: "cleared",
      });
    });
    const b = dashboard.budgets.find((x) => x.categoryId === "c");
    expect(b?.actualAmount).toBe(55); // 40 + 15, pending $999 still excluded
  });

  it("reload: budgets and their computed actuals survive a fresh pull from cloud state", async () => {
    await mountSynced();
    await act(async () => {
      await dashboard.addBudget({ categoryId: "c", periodId: "2026-01", month: "2026-01", plannedAmount: 100, actualAmount: 0 });
    });
    const pushed = mocks.push.mock.calls.at(-1)?.[1] as CloudState;
    expect(pushed.budgets).toHaveLength(1);
    expect(pushed.budgets[0].actualAmount).toBe(40);
  });
});
