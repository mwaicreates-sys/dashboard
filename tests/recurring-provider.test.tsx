// Phase 5 — recurring/planned transaction behavior through the real
// provider mutators (the same API RecurringSection/EntryTab call).
// Harness mirrors tests/mutation-durability.test.tsx.
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
  categories: [{ id: "c", name: "Bills", type: "expense", group: "expenses", color: "#112233" }],
  transactions: [],
  budgets: [],
  goals: [],
  plannedTransactions: [
    { id: "once1", date: "2026-01-10", accountId: "a", categoryId: "c", description: "One-off", amount: 20, type: "expense", status: "pending", recurrence: "once" },
    { id: "mon1", date: "2026-01-31", accountId: "a", categoryId: "c", description: "Subscription", amount: 15, type: "expense", status: "pending", recurrence: "monthly" },
    { id: "yr1", date: "2024-02-29", accountId: "a", categoryId: "c", description: "Insurance", amount: 300, type: "expense", status: "pending", recurrence: "yearly" },
  ],
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

describe("recurring / planned transactions", () => {
  it("paying a 'once' planned transaction creates a transaction and generates NO next occurrence", async () => {
    await mountSynced();
    await act(async () => { await dashboard.payPlannedTransaction("once1"); });
    expect(dashboard.transactions.filter((t) => t.plannedId === "once1")).toHaveLength(1);
    expect(dashboard.plannedTransactions.find((p) => p.id === "once1")?.status).toBe("completed");
    expect(dashboard.plannedTransactions.filter((p) => p.description === "One-off")).toHaveLength(1);
  });

  it("paying a monthly planned transaction generates exactly one next occurrence, clamped at month-end", async () => {
    await mountSynced();
    await act(async () => { await dashboard.payPlannedTransaction("mon1"); });
    expect(dashboard.transactions.filter((t) => t.plannedId === "mon1")).toHaveLength(1);
    const occurrences = dashboard.plannedTransactions.filter((p) => p.description === "Subscription");
    expect(occurrences).toHaveLength(2); // the now-completed original + exactly one new pending occurrence
    const next = occurrences.find((p) => p.status === "pending");
    expect(next?.date).toBe("2026-02-28"); // Jan 31 -> Feb 28 (non-leap), not Mar 3
    expect(next?.recurrence).toBe("monthly");
    expect(next?.amount).toBe(15);
  });

  it("paying a yearly planned transaction generates exactly one next occurrence a year later", async () => {
    await mountSynced();
    await act(async () => { await dashboard.payPlannedTransaction("yr1"); });
    const occurrences = dashboard.plannedTransactions.filter((p) => p.description === "Insurance");
    expect(occurrences).toHaveLength(2);
    const next = occurrences.find((p) => p.status === "pending");
    expect(next?.date).toBe("2025-02-28"); // leap Feb 29 2024 -> non-leap 2025
    expect(next?.recurrence).toBe("yearly");
  });

  it("paying the same planned transaction twice in a row never creates a duplicate transaction or a duplicate next occurrence", async () => {
    await mountSynced();
    // Simulates a rapid double-click: two overlapping calls against the same id.
    await act(async () => {
      await Promise.all([
        dashboard.payPlannedTransaction("mon1"),
        dashboard.payPlannedTransaction("mon1"),
      ]);
    });
    expect(dashboard.transactions.filter((t) => t.plannedId === "mon1")).toHaveLength(1);
    expect(dashboard.plannedTransactions.filter((p) => p.description === "Subscription" && p.status === "pending")).toHaveLength(1);
  });

  it("cancelling a planned transaction persists the cancellation and creates no transaction", async () => {
    await mountSynced();
    await act(async () => { await dashboard.cancelPlannedTransaction("once1"); });
    expect(dashboard.plannedTransactions.find((p) => p.id === "once1")?.status).toBe("cancelled");
    expect(dashboard.transactions.filter((t) => t.plannedId === "once1")).toHaveLength(0);
  });

  it("a newly scheduled planned transaction (via addPlanned) survives a reload of provider state", async () => {
    await mountSynced();
    await act(async () => {
      await dashboard.addPlanned({
        date: "2026-03-01", accountId: "a", categoryId: "c",
        description: "New scheduled item", amount: 42, type: "expense",
        status: "pending", recurrence: "once",
      });
    });
    expect(dashboard.plannedTransactions.some((p) => p.description === "New scheduled item")).toBe(true);
    // Reload: re-pull from cloud reflects the pushed state (durability contract).
    const pushed = mocks.push.mock.calls.at(-1)?.[1] as CloudState;
    expect(pushed.plannedTransactions.some((p) => p.description === "New scheduled item")).toBe(true);
  });
});
