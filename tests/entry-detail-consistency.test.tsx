// Entry card <-> detail page consistency fix.
//
// The Income/Outflow Entry cards correctly represent REALIZED totals
// (Phase 2's isRealized rule), with Outflow further scoped to the
// "outflow" classification (classifyEntryKind) — but /income and
// /outflow computed their own, looser period totals that still included
// pending transactions (and, for Outflow, any `type === "expense"`
// regardless of classification, which could sweep in legacy expense-
// shaped Savings/Debt/Investments entries). Clicking a card could land
// on a detail page showing a DIFFERENT number than the card itself.
// The same gap existed for /other (missing the isRealized filter the
// card's own flow stat applies). All three are fixed by applying the
// same isRealized filter (and, for Outflow, the same shared
// classifyEntryKind classification the card itself uses) on the detail
// pages, rather than inventing a second definition of "realized".
// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
import { EntryTab } from "@/components/shell/EntryTab";
import IncomeDetails from "@/(workspace)/income/page";
import OutflowDetails from "@/(workspace)/outflow/page";
import SavingsDetails from "@/(workspace)/savings/page";
import DebtsDetails from "@/(workspace)/debts/page";
import InvestmentsDetails from "@/(workspace)/investments/page";
import OtherDetails from "@/(workspace)/other/page";

const baseAccounts = () => [
  { id: "checking", name: "Checking", type: "checking" as const, openingBalance: 1000, currentBalance: 1000, currency: "USD", active: true },
  { id: "checking2", name: "Checking 2", type: "checking" as const, openingBalance: 0, currentBalance: 0, currency: "USD", active: true },
  { id: "savings", name: "Savings", type: "savings" as const, openingBalance: 200, currentBalance: 200, currency: "USD", active: true },
  { id: "investments", name: "Investments", type: "investment" as const, openingBalance: 100, currentBalance: 100, currency: "USD", active: true },
  { id: "card", name: "Credit Card", type: "credit_card" as const, openingBalance: -300, currentBalance: -300, currency: "USD", active: true },
];

const baseState = (): CloudState => ({
  accounts: baseAccounts(),
  categories: [
    { id: "groceries", name: "Groceries", type: "expense", group: "expenses", color: "#111" },
    { id: "salary", name: "Salary", type: "income", group: "income", color: "#222" },
  ],
  transactions: [], budgets: [], goals: [], plannedTransactions: [], activities: [], notifications: [], todos: [],
  selectedYear: 2026, currency: "USD", cloudRows: {},
});

function StatusSpy() {
  const data = useDashboardData();
  return <span data-testid="synced">{data.cloudSyncState === "synced" ? "ok" : ""}</span>;
}

async function renderEntryTab(state: CloudState) {
  mocks.pull.mockResolvedValue(state);
  const utils = render(<DashboardProvider><StatusSpy /><EntryTab /></DashboardProvider>);
  await waitFor(() => expect(screen.getByTestId("synced").textContent).toBe("ok"));
  return utils;
}

async function renderDetailPage(state: CloudState, Page: React.ComponentType) {
  mocks.pull.mockResolvedValue(state);
  const utils = render(<DashboardProvider><StatusSpy /><Page /></DashboardProvider>);
  await waitFor(() => expect(screen.getByTestId("synced").textContent).toBe("ok"));
  return utils;
}

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  mocks.businesses.mockResolvedValue([{ id: "business-a", name: "A", slug: null, currency: "USD", role: "owner" }]);
  mocks.push.mockImplementation(async (_id, next) => ({ ...next, cloudRows: {} }));
});
afterEach(cleanup);

/** Reads the exact headline figure text off a given Entry card. */
function readCard(kindId: string): string {
  const link = screen.getByRole("link", { name: new RegExp(`^View ${kindId}$`, "i") });
  const card = link.parentElement as HTMLElement;
  const amountEl = within(card).getByText((_, el) => el?.tagName === "P" && (el.className as string).includes("tabular-nums"));
  return amountEl.textContent!.trim();
}

describe("Income: pending excluded from the detail page's realized total", () => {
  it("/income's Total Income excludes a pending transaction", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-01", accountId: "checking", categoryId: "salary", type: "income", amount: 500, description: "Cleared", status: "cleared" },
      { id: "t2", date: "2026-03-02", accountId: "checking", categoryId: "salary", type: "income", amount: 9999, description: "Pending", status: "pending" },
    ];
    await renderDetailPage(state, IncomeDetails);
    const total = screen.getByText("Total Income").closest("div")!;
    expect(within(total).getByText("$500.00")).toBeTruthy();
    expect(screen.queryByText(/9,999|10,499/)).toBeNull();
  });
});

describe("Outflow: pending and internal transfers excluded from the detail page's realized total", () => {
  it("/outflow's Total Outflow excludes a pending expense", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-01", accountId: "checking", categoryId: "groceries", type: "expense", amount: 50, description: "Cleared", status: "cleared" },
      { id: "t2", date: "2026-03-02", accountId: "checking", categoryId: "groceries", type: "expense", amount: 9999, description: "Pending", status: "pending" },
    ];
    await renderDetailPage(state, OutflowDetails);
    const total = screen.getByText("Total Outflow").closest("div")!;
    expect(within(total).getByText("$50.00")).toBeTruthy();
  });

  it("/outflow's Total Outflow excludes an internal (non-debt/savings/investment) transfer", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-01", accountId: "checking", categoryId: "groceries", type: "expense", amount: 50, description: "Real spend", status: "cleared" },
      // A transfer between two plain checking accounts, uncategorized (no
      // bills/expenses-group category attached) — classifyEntryKind has
      // no basis to call this an outflow (it isn't a debt/savings/
      // investment move either), so it correctly falls to "other" and
      // must not inflate totalOutflow.
      { id: "t2", date: "2026-03-02", accountId: "checking", categoryId: "does-not-exist", toAccountId: "checking2", type: "transfer", amount: 400, description: "Move between checking", status: "cleared" },
    ];
    await renderDetailPage(state, OutflowDetails);
    const total = screen.getByText("Total Outflow").closest("div")!;
    expect(within(total).getByText("$50.00")).toBeTruthy();
  });

  it("/outflow's Total Outflow excludes a legacy expense-shaped Savings transfer", async () => {
    const state = baseState();
    state.categories.push({ id: "savings-cat", name: "Savings", type: "expense", group: "savings", color: "#3" });
    state.transactions = [
      { id: "t1", date: "2026-03-01", accountId: "checking", categoryId: "groceries", type: "expense", amount: 50, description: "Real spend", status: "cleared" },
      // Legacy shape: type="expense" tagged with a savings-group category
      // (pre-dates the simplified-Entry transfer fix) — must classify as
      // Savings, not Outflow, matching the Entry card's own logic.
      { id: "t2", date: "2026-03-02", accountId: "checking", categoryId: "savings-cat", type: "expense", amount: 700, description: "Old-style savings entry", status: "cleared" },
    ];
    await renderDetailPage(state, OutflowDetails);
    const total = screen.getByText("Total Outflow").closest("div")!;
    expect(within(total).getByText("$50.00")).toBeTruthy();
  });
});

describe("Other: pending excluded from the detail page's realized total", () => {
  it("/other's Total excludes a pending unclassifiable transaction", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-01", accountId: "checking", categoryId: "does-not-exist", type: "expense", amount: 42, description: "Cleared unclassifiable", status: "cleared" },
      { id: "t2", date: "2026-03-02", accountId: "checking", categoryId: "does-not-exist", type: "expense", amount: 9999, description: "Pending unclassifiable", status: "pending" },
    ];
    await renderDetailPage(state, OtherDetails);
    const total = screen.getByText("Total").closest("div")!;
    expect(within(total).getByText("$42.00")).toBeTruthy();
  });
});

describe("Six-card <-> detail consistency", () => {
  const scenario = () => {
    const state = baseState();
    state.transactions = [
      { id: "income1", date: "2026-03-01", accountId: "checking", categoryId: "salary", type: "income", amount: 1000, description: "Salary", status: "cleared" },
      { id: "outflow1", date: "2026-03-02", accountId: "checking", categoryId: "groceries", type: "expense", amount: 75, description: "Groceries", status: "cleared" },
      { id: "other1", date: "2026-03-03", accountId: "checking", categoryId: "unknown-legacy", type: "expense", amount: 20, description: "Unclassifiable", status: "cleared" },
    ];
    return state;
  };

  it("Income card amount matches /income's Total Income", async () => {
    const state = scenario();
    const { unmount } = await renderEntryTab(state);
    const cardValue = readCard("income");
    unmount();
    cleanup();
    await renderDetailPage(state, IncomeDetails);
    const total = screen.getByText("Total Income").closest("div")!;
    expect(within(total).getByText(cardValue)).toBeTruthy();
  });

  it("Outflow card amount matches /outflow's Total Outflow", async () => {
    const state = scenario();
    const { unmount } = await renderEntryTab(state);
    const cardValue = readCard("outflow");
    unmount();
    cleanup();
    await renderDetailPage(state, OutflowDetails);
    const total = screen.getByText("Total Outflow").closest("div")!;
    expect(within(total).getByText(cardValue)).toBeTruthy();
  });

  it("Savings card current balance matches /savings' Total Saved", async () => {
    const state = scenario();
    const { unmount } = await renderEntryTab(state);
    const cardValue = readCard("savings");
    unmount();
    cleanup();
    await renderDetailPage(state, SavingsDetails);
    const total = screen.getByText("Total Saved").closest("div")!;
    expect(within(total).getByText(cardValue)).toBeTruthy();
  });

  it("Debt card current owed matches /debts' Total Debt", async () => {
    const state = scenario();
    const { unmount } = await renderEntryTab(state);
    const cardValue = readCard("debt");
    unmount();
    cleanup();
    await renderDetailPage(state, DebtsDetails);
    const total = screen.getByText("Total Debt").closest("div")!;
    expect(within(total).getByText(cardValue)).toBeTruthy();
  });

  it("Investments card current balance matches /investments' Total Invested", async () => {
    const state = scenario();
    const { unmount } = await renderEntryTab(state);
    const cardValue = readCard("investments");
    unmount();
    cleanup();
    await renderDetailPage(state, InvestmentsDetails);
    const total = screen.getByText("Total Invested").closest("div")!;
    expect(within(total).getByText(cardValue)).toBeTruthy();
  });

  it("Other card period amount matches /other's Total", async () => {
    const state = scenario();
    const { unmount } = await renderEntryTab(state);
    const cardValue = readCard("other");
    unmount();
    cleanup();
    await renderDetailPage(state, OtherDetails);
    const total = screen.getByText("Total").closest("div")!;
    expect(within(total).getByText(cardValue)).toBeTruthy();
  });
});
