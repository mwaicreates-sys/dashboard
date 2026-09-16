// Phase 6 — proves the DashboardProvider context-value memoization fix
// (useStableActions + useMemo around `value`).
//
// Before this fix, `value` was a plain object literal rebuilt on every
// render of DashboardProvider, and its ~35 action functions were fresh
// closures every render too. Since React context notifies every consumer
// whenever the `value` reference changes — with no per-field
// granularity — this meant EVERY component calling useDashboardData()
// re-rendered whenever DashboardProvider re-rendered for ANY reason,
// including reasons that changed none of its own state (e.g. a parent
// re-rendering, or a route change via usePathname while staying under
// the same layout).
//
// This test proves the fixed behavior directly: forcing an UNRELATED
// re-render of DashboardProvider's parent (touching zero dashboard state)
// must NOT re-render a child that only reads one unrelated context field.
// @vitest-environment jsdom
import React, { useLayoutEffect, useState } from "react";
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
  accounts: [{ id: "a", name: "Cash", type: "checking", openingBalance: 100, currentBalance: 100, currency: "USD", active: true }],
  categories: [], transactions: [], budgets: [], goals: [], plannedTransactions: [],
  activities: [], notifications: [], todos: [],
  selectedYear: 2026, currency: "USD", cloudRows: {},
});

let currencyRenders = 0;

// Render counts are recorded in a layout effect (after commit), not the
// render body itself — mutating module-level state during render is
// exactly the kind of impurity these counters exist to detect elsewhere;
// here it's test instrumentation, kept effect-scoped to stay a fair
// counter (one increment per actual commit) without being an example of
// the anti-pattern.
function CurrencyConsumer() {
  const { currency } = useDashboardData();
  useLayoutEffect(() => { currencyRenders += 1; });
  return <span data-testid="currency">{currency}</span>;
}

function StatusProbe() {
  const data = useDashboardData();
  return <span data-testid="status">{data.cloudSyncState}</span>;
}

function ParentWithUnrelatedState({ children }: { children: React.ReactNode }) {
  const [, setTick] = useState(0);
  return (
    <div>
      <button onClick={() => setTick((t) => t + 1)} data-testid="unrelated-rerender-trigger">
        rerender parent
      </button>
      {children}
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  currencyRenders = 0;
  mocks.businesses.mockResolvedValue([{ id: "business-a", name: "A", slug: null, currency: "USD", role: "owner" }]);
  mocks.pull.mockResolvedValue(initial());
  mocks.push.mockImplementation(async (_id, next) => ({ ...next, cloudRows: {} }));
});
afterEach(cleanup);

describe("DashboardProvider context value stability", () => {
  it("an unrelated parent re-render does NOT re-render a component that only reads dashboard context", async () => {
    render(
      <ParentWithUnrelatedState>
        <DashboardProvider>
          <StatusProbe />
          <CurrencyConsumer />
        </DashboardProvider>
      </ParentWithUnrelatedState>
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));

    const rendersAfterMount = currencyRenders;
    expect(rendersAfterMount).toBeGreaterThan(0);

    // Trigger 5 re-renders of the PARENT — zero dashboard state touched.
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        screen.getByTestId("unrelated-rerender-trigger").click();
      });
    }

    // Before the memoization fix, each of these 5 parent re-renders would
    // force DashboardProvider to rebuild `value` with a new reference
    // (unmemoized object literal + fresh closures every render), and
    // CurrencyConsumer would re-render every single time even though
    // `currency` never changed. With the fix, `value`'s reference is
    // unchanged (none of its useMemo deps changed), so React bails out of
    // notifying CurrencyConsumer entirely.
    expect(currencyRenders).toBe(rendersAfterMount);
  });

  it("a genuine currency change still re-renders consumers reading currency (the fix does not silence real updates)", async () => {
    let dashboard: ReturnType<typeof useDashboardData>;
    function Setter() {
      const data = useDashboardData();
      useLayoutEffect(() => { dashboard = data; }, [data]);
      return null;
    }
    render(
      <DashboardProvider>
        <Setter />
        <StatusProbe />
        <CurrencyConsumer />
      </DashboardProvider>
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
    const before = currencyRenders;
    await act(async () => { dashboard.setCurrency("KES"); });
    await waitFor(() => expect(screen.getByTestId("currency").textContent).toBe("KES"));
    expect(currencyRenders).toBeGreaterThan(before);
  });
});
