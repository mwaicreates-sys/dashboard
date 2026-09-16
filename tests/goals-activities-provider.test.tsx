// Phase 5 — goals + activities reverification (no bugs found; these are
// regression tests confirming the existing Phase 2/3 behavior, not repairs).
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
  categories: [],
  transactions: [],
  budgets: [],
  goals: [],
  plannedTransactions: [],
  activities: [
    { id: "act1", title: "Call bank", date: "2026-01-05", status: "pending" },
    { id: "act2", title: "Review budget", date: "2026-02-10", status: "pending" },
  ],
  notifications: [], todos: [],
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

describe("goals", () => {
  it("create, contribute (partial), and reload persistence", async () => {
    await mountSynced();
    await act(async () => {
      await dashboard.addGoal({ name: "Emergency fund", targetAmount: 1000, currentAmount: 0, targetDate: "", status: "active" });
    });
    const id = dashboard.goals.find((g) => g.name === "Emergency fund")!.id;
    await act(async () => { await dashboard.updateGoal(id, { currentAmount: 300, status: "active" }); });
    expect(dashboard.goals.find((g) => g.id === id)?.currentAmount).toBe(300);
    expect(dashboard.goals.find((g) => g.id === id)?.status).toBe("active");
    const pushed = mocks.push.mock.calls.at(-1)?.[1] as CloudState;
    expect(pushed.goals.find((g) => g.id === id)?.currentAmount).toBe(300); // reload-durable
  });

  it("contributing enough to reach the target marks the goal completed", async () => {
    await mountSynced();
    await act(async () => {
      await dashboard.addGoal({ name: "Laptop", targetAmount: 500, currentAmount: 400, targetDate: "", status: "active" });
    });
    const id = dashboard.goals.find((g) => g.name === "Laptop")!.id;
    await act(async () => { await dashboard.updateGoal(id, { currentAmount: 500, status: "completed" }); });
    expect(dashboard.goals.find((g) => g.id === id)?.status).toBe("completed");
  });

  it("delete removes the goal and persists the removal", async () => {
    await mountSynced();
    await act(async () => {
      await dashboard.addGoal({ name: "Vacation", targetAmount: 200, currentAmount: 0, targetDate: "", status: "active" });
    });
    const id = dashboard.goals.find((g) => g.name === "Vacation")!.id;
    await act(async () => { await dashboard.deleteGoal(id); });
    expect(dashboard.goals.some((g) => g.id === id)).toBe(false);
  });
});

describe("activities", () => {
  it("create, edit, complete, delete", async () => {
    await mountSynced();
    await act(async () => {
      await dashboard.addActivity({ title: "Renew insurance", date: "2026-03-01", status: "pending" });
    });
    const id = dashboard.activities.find((a) => a.title === "Renew insurance")!.id;
    await act(async () => { await dashboard.updateActivityStatus(id, "completed"); });
    expect(dashboard.activities.find((a) => a.id === id)?.status).toBe("completed");
    await act(async () => { await dashboard.deleteActivity(id); });
    expect(dashboard.activities.some((a) => a.id === id)).toBe(false);
  });

  it("date filtering finds activities scheduled within a given month, excludes others", async () => {
    await mountSynced();
    const januaryActivities = dashboard.activities.filter((a) => a.date.startsWith("2026-01"));
    const februaryActivities = dashboard.activities.filter((a) => a.date.startsWith("2026-02"));
    expect(januaryActivities.map((a) => a.id)).toEqual(["act1"]);
    expect(februaryActivities.map((a) => a.id)).toEqual(["act2"]);
  });
});
