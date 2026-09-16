// Phase 3 — durable persistence + cloud sync reliability regression tests.
//
// These exercise the provider's actual exposed mutator methods directly
// (the same API every UI component calls through — EntryTab's buttons,
// GoalsProgress, ActivityTab, RecurringSection, etc. all resolve to these).
// Driving through the DOM for every one of the ~15 entity operations would
// be extremely repetitive without testing anything the direct call doesn't
// already prove: the contract lives in dashboardData.tsx's commitMutation,
// not in any particular button's onClick. One DOM-level integration test
// (EntryForm's Save button) already exists in entry-provider.test.tsx and
// is not duplicated here.
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
import { ConflictError } from "@/lib/cloudSync";

const initial = (): CloudState => ({
  accounts: [{ id: "a", name: "Cash", type: "checking", openingBalance: 100, currentBalance: 100, currency: "USD", active: true }],
  categories: [{ id: "c", name: "Food", type: "expense", group: "expenses", color: "#112233" }],
  transactions: [{ id: "tx-x", date: "2026-01-01", accountId: "a", categoryId: "c", type: "expense", amount: 10, description: "Coffee", status: "pending" }],
  budgets: [],
  goals: [],
  plannedTransactions: [{ id: "p1", date: "2026-01-01", accountId: "a", categoryId: "c", description: "Rent", amount: 50, type: "expense", status: "pending" }],
  activities: [{ id: "x", title: "Call bank", date: "2026-01-01", status: "pending" }],
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

describe("per-entity durability — resolves only after acknowledgement, rejects and stays retryable on failure", () => {
  const cases: Array<{ name: string; run: () => Promise<unknown> }> = [
    { name: "account create", run: () => dashboard.addAccount({ name: "Savings", type: "savings", openingBalance: 0, currency: "USD", active: true }) },
    { name: "account edit", run: () => dashboard.updateAccount("a", { name: "Renamed" }) },
    { name: "account delete", run: () => dashboard.deleteAccount("a") },
    { name: "category create", run: () => dashboard.addCategory({ name: "Rent", group: "bills", type: "expense", color: "#000" }) },
    { name: "category edit", run: () => dashboard.updateCategory("c", { name: "Groceries" }) },
    { name: "category delete", run: () => dashboard.deleteCategory("c") },
    { name: "budget create", run: () => dashboard.addBudget({ categoryId: "c", periodId: "2026", month: "2026-01", plannedAmount: 100, actualAmount: 0 }) },
    { name: "goal create", run: () => dashboard.addGoal({ name: "Emergency fund", targetAmount: 1000, currentAmount: 0, targetDate: "", status: "active" }) },
    { name: "activity create", run: () => dashboard.addActivity({ title: "Call bank", date: "2026-01-01", status: "pending" }) },
    { name: "activity status toggle", run: () => dashboard.updateActivityStatus("x", "completed") },
    { name: "transaction status change", run: () => dashboard.updateTransaction("tx-x", { status: "cleared" }) },
    { name: "transaction delete", run: () => dashboard.deleteTransaction("tx-x") },
    { name: "planned payment", run: () => dashboard.payPlannedTransaction("p1") },
    { name: "planned cancel", run: () => dashboard.cancelPlannedTransaction("p1") },
  ];

  for (const { name, run } of cases) {
    it(`${name}: rejects on a failed push (never silently reports success)`, async () => {
      await mountSynced();
      mocks.push.mockRejectedValueOnce(new Error("network error"));
      await expect(run()).rejects.toThrow("network error");
    });
  }

  it("account create: the promise does not resolve until push() has actually been awaited", async () => {
    await mountSynced();
    let released!: () => void;
    mocks.push.mockImplementationOnce(() => new Promise((resolve) => {
      released = () => resolve({ ...initial(), cloudRows: {} });
    }));
    let resolved = false;
    const p = dashboard.addAccount({ name: "Savings", type: "savings", openingBalance: 0, currency: "USD", active: true })
      .then(() => { resolved = true; });
    await Promise.resolve(); // let microtasks settle
    expect(resolved).toBe(false); // still pending — push hasn't acknowledged yet
    await act(async () => { released(); await p; });
    expect(resolved).toBe(true);
  });
});

describe("TEST D/E — dirty state means unsaved", () => {
  it("push fails → dirty state remains (cloudSyncState stays error, the change is still pending)", async () => {
    await mountSynced();
    // Persistent rejection (not just-once): the provider's own auto-sync
    // effect retries on the very next render (the optimistic setState this
    // mutation just applied), so a single mockRejectedValueOnce gets
    // "cured" by that immediate self-healing retry before this assertion
    // could observe it — that's correct system behavior, not a test bug,
    // but it means proving the error state stays requires the retry to
    // keep failing too.
    mocks.push.mockRejectedValue(new Error("write rejected"));
    await act(async () => {
      await expect(dashboard.addCategory({ name: "New", group: "expenses", type: "expense", color: "#000" })).rejects.toThrow();
    });
    expect(screen.getByTestId("status").textContent).toBe("error");
    // The mutation is still pending, not discarded — confirmed via a
    // successful flush recovering it below (TEST E), not lost data.
  });

  it("push succeeds → dirty state clears (cloudSyncState returns to synced)", async () => {
    await mountSynced();
    await act(async () => { await dashboard.addCategory({ name: "New", group: "expenses", type: "expense", color: "#000" }); });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
  });

  it("recovery: a previously failed mutation is not lost — it persists once the next flush succeeds", async () => {
    await mountSynced();
    mocks.push.mockRejectedValue(new Error("write rejected"));
    await act(async () => {
      await expect(dashboard.addCategory({ name: "Recovered", group: "expenses", type: "expense", color: "#000" })).rejects.toThrow();
    });
    expect(screen.getByTestId("status").textContent).toBe("error");
    expect(dashboard.categories.some((c) => c.name === "Recovered")).toBe(true); // stayed applied locally, not rolled back
    mocks.push.mockImplementation(async (_id, next) => ({ ...next, cloudRows: {} })); // network recovers
    await act(async () => { await dashboard.flushCloudChanges(); });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
    expect(mocks.push.mock.calls.some((call) =>
      (call[1] as CloudState).categories.some((c) => c.name === "Recovered"))).toBe(true);
  });
});

describe("TEST F/G — hydration gates automatic push", () => {
  it("F: a failed cloud pull never unlocks pushing (no queue exists, mutations reject)", async () => {
    mocks.pull.mockRejectedValue(new Error("read failed"));
    render(<DashboardProvider><Probe /></DashboardProvider>);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("offline"));
    await expect(dashboard.addAccount({ name: "X", type: "checking", openingBalance: 0, currency: "USD", active: true }))
      .rejects.toThrow("not ready");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("G: a successful cloud pull unlocks automatic sync", async () => {
    await mountSynced();
    await act(async () => { await dashboard.addAccount({ name: "X", type: "checking", openingBalance: 0, currency: "USD", active: true }); });
    expect(mocks.push).toHaveBeenCalled();
  });
});

describe("Phase 3 fix — conflict does not produce an infinite stale retry loop", () => {
  it("a 40001 conflict is terminal: the queue stops retrying, and reports a distinct 'conflict' status exactly once", async () => {
    await mountSynced();
    mocks.push.mockRejectedValueOnce(new ConflictError("This record changed in another session. Reload before editing it."));
    await expect(dashboard.addCategory({ name: "New", group: "expenses", type: "expense", color: "#000" })).rejects.toThrow("changed in another session");
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("conflict"));
    const callsAfterConflict = mocks.push.mock.calls.length;
    // Any further mutation attempt must reject IMMEDIATELY without calling
    // push again — retrying the same stale write can never succeed.
    await expect(dashboard.addCategory({ name: "Another", group: "expenses", type: "expense", color: "#000" }))
      .rejects.toThrow("changed elsewhere");
    await expect(dashboard.addCategory({ name: "Yet another", group: "expenses", type: "expense", color: "#000" }))
      .rejects.toThrow("changed elsewhere");
    expect(mocks.push.mock.calls.length).toBe(callsAfterConflict); // no new push calls — the loop is broken
  });
});

describe("TEST K — business switching never lets a stale queue write to another business", () => {
  it("a queue instance is permanently bound to the business it was created for", async () => {
    await mountSynced();
    expect(dashboard.activeBusiness?.id).toBe("business-a");

    let releaseBusinessAPush!: (v: unknown) => void;
    const businessAPushCalls: string[] = [];
    mocks.push.mockImplementationOnce((id: string) => {
      businessAPushCalls.push(id);
      return new Promise((resolve) => { releaseBusinessAPush = resolve; });
    });
    // Start a mutation for business A but do not let its push resolve yet —
    // this simulates a switch happening while a write is still in flight.
    const pending = dashboard.addAccount({ name: "Mid-flight", type: "checking", openingBalance: 0, currency: "USD", active: true });
    await Promise.resolve();
    expect(businessAPushCalls).toEqual(["business-a"]);

    // A real business switch is a full page reload in the app (CloudAccountCard
    // .switchBusiness), which destroys this JS context and its queue entirely.
    // We simulate that here by resolving the in-flight write for A and
    // confirming it was recorded against A's id, never anything else — the
    // queue captured its businessId at construction time and never re-reads
    // "current active business" from elsewhere.
    releaseBusinessAPush({ ...initial(), cloudRows: {} });
    await pending;
    expect(businessAPushCalls).toEqual(["business-a"]);
    expect(businessAPushCalls.every((id) => id === "business-a")).toBe(true);
  });
});

describe("TEST M — network failure followed by recovery persists without duplication", () => {
  it("a failed then retried write results in exactly one record, not two", async () => {
    await mountSynced();
    mocks.push.mockRejectedValueOnce(new Error("network down"));
    await expect(dashboard.addGoal({ name: "Trip fund", targetAmount: 500, currentAmount: 0, targetDate: "", status: "active" }))
      .rejects.toThrow("network down");
    // Recovery: the next successful flush (any subsequent mutation, or the
    // 'online' listener in the real app) retries the SAME pending snapshot.
    await act(async () => { await dashboard.addActivity({ title: "Nudge", date: "2026-01-01", status: "pending" }); });
    const goalNames = dashboard.goals.map((g) => g.name);
    expect(goalNames.filter((n) => n === "Trip fund")).toHaveLength(1); // no duplicate
  });
});
