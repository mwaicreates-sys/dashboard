// Entry page information-display audit fix.
//
// Adds an "Available Balance" summary above the six cards (current
// spendable balance, NOT income) and corrects each card's own data
// source: Income/Outflow now exclude pending and internal transfers and
// use "earned"/"spent" wording; Savings/Debt/Investments now always show
// a CURRENT BALANCE as the big number (never replaced by a period
// movement count) with the period movement as a separate secondary line;
// Debt correctly recognizes credit/credit_card/loan; "Other" now
// deterministically catches genuinely unclassifiable entries instead of
// being permanently unreachable dead code.
// @vitest-environment jsdom
import React, { useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("@/components/shell/SearchableSelect", () => ({
  SearchableSelect: ({ value, onChange, items, placeholder }: {
    value: string; onChange: (value: string) => void; items: { id: string; label: string }[]; placeholder: string;
  }) => (
    <select aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose</option>
      {items.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  ),
}));

import { DashboardProvider, useDashboardData } from "@/lib/dashboardData";
import { EntryTab } from "@/components/shell/EntryTab";
import { CloudAccountCard } from "@/components/shell/CloudAccountCard";

const baseAccounts = () => [
  { id: "checking", name: "Checking", type: "checking" as const, openingBalance: 0, currentBalance: 0, currency: "USD", active: true },
  { id: "savings", name: "Savings", type: "savings" as const, openingBalance: 0, currentBalance: 0, currency: "USD", active: true },
  { id: "investments", name: "Investments", type: "investment" as const, openingBalance: 0, currentBalance: 0, currency: "USD", active: true },
  { id: "card", name: "Credit Card", type: "credit_card" as const, openingBalance: -500, currentBalance: -500, currency: "USD", active: true },
];

const baseState = (): CloudState => ({
  accounts: baseAccounts(),
  categories: [{ id: "groceries", name: "Groceries", type: "expense", group: "expenses", color: "#111" }],
  transactions: [], budgets: [], goals: [], plannedTransactions: [], activities: [], notifications: [], todos: [],
  selectedYear: 2026, currency: "USD", cloudRows: {},
});

let dashboard: ReturnType<typeof useDashboardData>;
function Probe() {
  const data = useDashboardData();
  useLayoutEffect(() => { dashboard = data; }, [data]);
  return <span data-testid="status">{data.cloudSyncState}</span>;
}

async function mountSynced(state: CloudState = baseState(), extra?: React.ReactNode) {
  mocks.pull.mockResolvedValue(state);
  render(<DashboardProvider><Probe /><EntryTab />{extra}</DashboardProvider>);
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
}

/** Reads a card's rendered main/sub/tertiary text via its "Add X entry" button. */
function readCard(label: string) {
  const btn = screen.getByRole("button", { name: `Add ${label} entry` });
  const card = btn.closest(".group") as HTMLElement;
  if (!card) throw new Error(`Could not find card container for "${label}"`);
  return within(card);
}

function availableBalanceText() {
  const label = screen.getByText("Available balance");
  return label.parentElement!.querySelector("p.text-xl, p.text-2xl")!.textContent;
}

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  mocks.businesses.mockResolvedValue([{ id: "business-a", name: "A", slug: null, currency: "USD", role: "owner" }]);
  mocks.push.mockImplementation(async (_id, next) => ({ ...next, cloudRows: {} }));
});
afterEach(cleanup);

describe("14. Complete money story", () => {
  it("Income -> Save -> Spend -> Invest -> Pay debt, verified at every step, then survives reload", async () => {
    await mountSynced();

    // STEP 1 — Income +$1,000 into Checking
    fireEvent.click(screen.getByRole("button", { name: "Add income entry" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "1000" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add income" }));
    await waitFor(() => expect(dashboard.accounts.find((a) => a.id === "checking")?.currentBalance).toBe(1000));

    expect(availableBalanceText()).toBe("$1,000.00");
    expect(readCard("income").getByText("$1,000.00")).toBeTruthy();
    expect(readCard("outflow").getByText("$0.00")).toBeTruthy();
    expect(readCard("debt").getByText("$500.00")).toBeTruthy();

    // STEP 2 — Save $200 from Checking
    fireEvent.click(screen.getByRole("button", { name: "Add savings entry" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "200" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to savings" }));
    await waitFor(() => expect(dashboard.accounts.find((a) => a.id === "savings")?.currentBalance).toBe(200));

    expect(availableBalanceText()).toBe("$800.00");
    expect(readCard("income").getByText("$1,000.00")).toBeTruthy(); // unchanged
    expect(readCard("outflow").getByText("$0.00")).toBeTruthy(); // unchanged — not an expense
    expect(readCard("savings").getByText("$200.00")).toBeTruthy();

    // STEP 3 — Spend $100 (Groceries, Checking)
    fireEvent.click(screen.getByRole("button", { name: "Add outflow entry" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "100" } });
    const categorySelect = within(dialog).getAllByRole("combobox").find((n) => n.textContent?.includes("Groceries"))!;
    fireEvent.change(categorySelect, { target: { value: "groceries" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add outflow" }));
    await waitFor(() => expect(dashboard.accounts.find((a) => a.id === "checking")?.currentBalance).toBe(700));

    expect(availableBalanceText()).toBe("$700.00");
    expect(readCard("income").getByText("$1,000.00")).toBeTruthy();
    expect(readCard("outflow").getByText("$100.00")).toBeTruthy();
    expect(readCard("savings").getByText("$200.00")).toBeTruthy(); // unaffected by unrelated spend

    // STEP 4 — Invest $100
    fireEvent.click(screen.getByRole("button", { name: "Add investments entry" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "100" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add investment" }));
    await waitFor(() => expect(dashboard.accounts.find((a) => a.id === "investments")?.currentBalance).toBe(100));

    expect(availableBalanceText()).toBe("$600.00");
    expect(readCard("outflow").getByText("$100.00")).toBeTruthy(); // unchanged — investing is not spending
    expect(readCard("investments").getByText("$100.00")).toBeTruthy();
    expect(readCard("savings").getByText("$200.00")).toBeTruthy();

    // STEP 5 — Pay $50 toward debt principal
    fireEvent.click(screen.getByRole("button", { name: "Add debt entry" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "50" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add debt payment" }));
    await waitFor(() => expect(dashboard.accounts.find((a) => a.id === "card")?.currentBalance).toBe(-450));

    expect(availableBalanceText()).toBe("$550.00");
    expect(readCard("income").getByText("$1,000.00")).toBeTruthy();
    expect(readCard("outflow").getByText("$100.00")).toBeTruthy(); // debt principal is not outflow
    expect(readCard("savings").getByText("$200.00")).toBeTruthy();
    expect(readCard("investments").getByText("$100.00")).toBeTruthy();
    expect(readCard("debt").getByText("$450.00")).toBeTruthy();

    // Capture the exact pushed state for the reload check below.
    const pushed = mocks.push.mock.calls.at(-1)?.[1] as CloudState;

    // RELOAD — fresh mount, hydrate from the pushed cloud state.
    cleanup();
    await mountSynced({ ...pushed, cloudRows: {} });
    expect(availableBalanceText()).toBe("$550.00");
    expect(readCard("income").getByText("$1,000.00")).toBeTruthy();
    expect(readCard("outflow").getByText("$100.00")).toBeTruthy();
    expect(readCard("savings").getByText("$200.00")).toBeTruthy();
    expect(readCard("investments").getByText("$100.00")).toBeTruthy();
    expect(readCard("debt").getByText("$450.00")).toBeTruthy();
  });
});

describe("15. Independent coverage", () => {
  it("Savings current balance includes historical savings already present, not just this year's movement", async () => {
    const state = baseState();
    state.accounts = state.accounts.map((a) => (a.id === "savings" ? { ...a, openingBalance: 6900, currentBalance: 6900 } : a));
    await mountSynced(state);
    expect(readCard("savings").getByText("$6,900.00")).toBeTruthy();
    expect(readCard("savings").getByText("current balance")).toBeTruthy();
  });

  it("Investment current balance reflects the account balance directly", async () => {
    const state = baseState();
    state.accounts = state.accounts.map((a) => (a.id === "investments" ? { ...a, openingBalance: 2500, currentBalance: 2500 } : a));
    await mountSynced(state);
    expect(readCard("investments").getByText("$2,500.00")).toBeTruthy();
  });

  it("credit, credit_card, and loan ALL contribute to the Debt card", async () => {
    const state = baseState();
    state.accounts = [
      ...state.accounts.filter((a) => a.id !== "card"),
      { id: "credit1", name: "Credit", type: "credit", openingBalance: -100, currentBalance: -100, currency: "USD", active: true },
      { id: "card1", name: "Card", type: "credit_card", openingBalance: -200, currentBalance: -200, currency: "USD", active: true },
      { id: "loan1", name: "Loan", type: "loan", openingBalance: -300, currentBalance: -300, currency: "USD", active: true },
    ];
    await mountSynced(state);
    expect(readCard("debt").getByText("$600.00")).toBeTruthy(); // 100+200+300
  });

  it("pending income is excluded from the Income card", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-01", accountId: "checking", categoryId: "groceries", type: "income", amount: 500, description: "Cleared salary", status: "cleared" },
      { id: "t2", date: "2026-03-02", accountId: "checking", categoryId: "groceries", type: "income", amount: 9999, description: "Pending salary", status: "pending" },
    ];
    await mountSynced(state);
    expect(readCard("income").getByText("$500.00")).toBeTruthy();
  });

  it("pending outflow is excluded from the Outflow card", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-01", accountId: "checking", categoryId: "groceries", type: "expense", amount: 50, description: "Cleared spend", status: "cleared" },
      { id: "t2", date: "2026-03-02", accountId: "checking", categoryId: "groceries", type: "expense", amount: 9999, description: "Pending spend", status: "pending" },
    ];
    await mountSynced(state);
    expect(readCard("outflow").getByText("$50.00")).toBeTruthy();
  });

  it("an internal (non-debt/savings/investment) transfer is excluded from Income and Outflow", async () => {
    const state = baseState();
    state.accounts.push({ id: "checking2", name: "Checking 2", type: "checking", openingBalance: 0, currentBalance: 0, currency: "USD", active: true });
    state.transactions = [
      { id: "t1", date: "2026-03-01", accountId: "checking", categoryId: "groceries", type: "transfer", toAccountId: "checking2", amount: 250, description: "Move between checking", status: "cleared" },
    ];
    await mountSynced(state);
    expect(readCard("income").getByText("$0.00")).toBeTruthy();
    expect(readCard("outflow").getByText("$0.00")).toBeTruthy();
  });

  it("a savings withdrawal reduces the Savings card and increases Available Balance", async () => {
    const state = baseState();
    // currentBalance already reflects the withdrawal below (500-150,
    // 100+150) — matching how real hydrated production data looks
    // (currentBalance is maintained incrementally, not recomputed from
    // transactions on load).
    state.accounts = state.accounts.map((a) => {
      if (a.id === "savings") return { ...a, openingBalance: 500, currentBalance: 350 };
      if (a.id === "checking") return { ...a, openingBalance: 100, currentBalance: 250 };
      return a;
    });
    // Withdrawals aren't created through the simplified Savings form
    // (deposit-only by design) — this proves the DISPLAY correctly
    // reflects one if it exists in the data, regardless of entry path.
    state.transactions = [
      { id: "w1", date: "2026-03-01", accountId: "savings", categoryId: "groceries", type: "transfer", toAccountId: "checking", amount: 150, description: "Withdraw to checking", status: "cleared" },
    ];
    await mountSynced(state);
    expect(readCard("savings").getByText("$350.00")).toBeTruthy(); // 500 - 150
    expect(availableBalanceText()).toBe("$250.00"); // 100 + 150
  });

  it("card movement counts reflect realized transfers in both directions", async () => {
    const state = baseState();
    state.accounts = state.accounts.map((a) => (a.id === "savings" ? { ...a, openingBalance: 1000, currentBalance: 900 } : a));
    state.transactions = [
      { id: "d1", date: "2026-02-01", accountId: "checking", categoryId: "groceries", type: "transfer", toAccountId: "savings", amount: 200, description: "Deposit", status: "cleared" },
      { id: "w1", date: "2026-03-01", accountId: "savings", categoryId: "groceries", type: "transfer", toAccountId: "checking", amount: 300, description: "Withdraw", status: "cleared" },
    ];
    await mountSynced(state);
    expect(readCard("savings").getByText(/2 movements/)).toBeTruthy();
  });

  it("year filtering: a flow card only counts transactions in the selected year", async () => {
    const state = baseState();
    state.selectedYear = 2026;
    state.transactions = [
      { id: "t2025", date: "2025-06-01", accountId: "checking", categoryId: "groceries", type: "income", amount: 999, description: "Last year", status: "cleared" },
      { id: "t2026", date: "2026-06-01", accountId: "checking", categoryId: "groceries", type: "income", amount: 500, description: "This year", status: "cleared" },
    ];
    await mountSynced(state);
    expect(readCard("income").getByText("$500.00")).toBeTruthy();
  });

  it("current balances are NOT year-filtered: a prior-year deposit still counts in Savings' current balance", async () => {
    const state = baseState();
    state.selectedYear = 2026;
    state.accounts = state.accounts.map((a) => (a.id === "savings" ? { ...a, openingBalance: 400, currentBalance: 400 } : a));
    state.transactions = [
      { id: "old", date: "2024-01-01", accountId: "checking", categoryId: "groceries", type: "transfer", toAccountId: "savings", amount: 400, description: "Old deposit", status: "cleared" },
    ];
    await mountSynced(state);
    expect(readCard("savings").getByText("$400.00")).toBeTruthy(); // present despite being outside the selected year
  });

  it("an unclassifiable expense (orphaned category) surfaces under Other, not silently as Outflow", async () => {
    const state = baseState();
    // categoryId does not resolve to any known category (simulates an
    // orphaned/deleted category) — no group can be inferred at all.
    state.transactions = [
      { id: "t1", date: "2026-03-01", accountId: "checking", categoryId: "does-not-exist", type: "expense", amount: 75, description: "Unclassifiable", status: "cleared" },
    ];
    await mountSynced(state);
    expect(readCard("other").getByText("$75.00")).toBeTruthy();
    expect(readCard("outflow").getByText("$0.00")).toBeTruthy();
  });

  it("business switch updates every card to the new business's data with no cross-business bleed", async () => {
    // Business switching in this app is a full page reload (see
    // CloudAccountCard.switchBusiness: flush -> setActiveBusinessId ->
    // clearTenantLocalData -> window.location.reload()), not an in-place
    // SPA state swap — jsdom can't simulate an actual reload, so this
    // proves the two real guarantees: (1) the switch handler correctly
    // records the new active business and wipes the old tenant cache
    // BEFORE reload, and (2) the fresh mount that follows a real reload
    // (simulated here as a new render with the new business's pulled
    // state) shows only that business's figures — no business-A bleed.
    const stateA = baseState();
    stateA.accounts = stateA.accounts.map((a) => (a.id === "checking" ? { ...a, openingBalance: 1000, currentBalance: 1000 } : a));
    const stateB = baseState();
    stateB.accounts = stateB.accounts.map((a) => (a.id === "checking" ? { ...a, openingBalance: 77, currentBalance: 77 } : a));

    mocks.businesses.mockResolvedValue([
      { id: "business-a", name: "A", slug: null, currency: "USD", role: "owner" },
      { id: "business-b", name: "B", slug: null, currency: "USD", role: "owner" },
    ]);
    mocks.pull.mockResolvedValue(stateA);
    localStorage.setItem("budgeting-dashboard-v2-active-business", "business-a");

    const mounted = render(<DashboardProvider><Probe /><EntryTab /><CloudAccountCard /></DashboardProvider>);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
    expect(availableBalanceText()).toBe("$1,000.00");

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Active business"), { target: { value: "business-b" } });
    });
    // The switch recorded the new active business and wiped the old
    // tenant cache before attempting the (unsimulable-in-jsdom) reload.
    expect(localStorage.getItem("budgeting-dashboard-v2-active-business")).toBe("business-b");
    expect(localStorage.getItem("budgeting-dashboard-v2-transactions")).toBeNull();

    // Simulate the post-reload mount: fresh render, business B's pulled state.
    mounted.unmount();
    cleanup();
    mocks.pull.mockResolvedValue(stateB);
    render(<DashboardProvider><Probe /><EntryTab /></DashboardProvider>);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
    expect(availableBalanceText()).toBe("$77.00");
    expect(screen.queryByText("$1,000.00")).toBeNull(); // no business-A figure survives
  });
});
