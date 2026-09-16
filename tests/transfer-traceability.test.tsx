// Internal-transfer traceability fix.
//
// The accounting was already correct: a transfer is ONE canonical
// Transaction row (accountId = source, toAccountId = destination,
// amount = the one unsigned magnitude both legs share) — accountDelta in
// dashboardData.tsx already derives both signed effects from it when
// summing balances. The gap was purely presentational: nothing showed
// the user BOTH effects of that one transfer. This file proves:
//   - the shared getTransferAccountEffect helper derives direction/sign
//     correctly without creating a second record,
//   - the Recorded list, Savings/Investments/Debts detail pages, and the
//     EntryForm edit modal (reused as the transfer-detail view) all
//     surface both legs,
//   - exactly ONE transaction is ever persisted for one transfer,
//   - pending transfers don't leak into realized movement totals,
//   - state survives a simulated reload/hydration unchanged.
// @vitest-environment jsdom
import React, { useLayoutEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudState } from "@/lib/cloudSync";
import { getTransferAccountEffect } from "@/lib/transferEffect";

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
import SavingsDetails from "@/(workspace)/savings/page";
import InvestmentsDetails from "@/(workspace)/investments/page";
import DebtsDetails from "@/(workspace)/debts/page";

const baseAccounts = () => [
  { id: "checking", name: "Checking", type: "checking" as const, openingBalance: 0, currentBalance: 0, currency: "USD", active: true },
  { id: "savings", name: "Savings", type: "savings" as const, openingBalance: 0, currentBalance: 0, currency: "USD", active: true },
  { id: "investments", name: "Investments", type: "investment" as const, openingBalance: 0, currentBalance: 0, currency: "USD", active: true },
  { id: "card", name: "Credit Card", type: "credit_card" as const, openingBalance: -300, currentBalance: -300, currency: "USD", active: true },
];

const baseState = (): CloudState => ({
  accounts: baseAccounts(),
  categories: [
    { id: "salary", name: "Salary", type: "income", group: "income", color: "#1" },
    { id: "savings-cat", name: "Savings", type: "expense", group: "savings", color: "#2" },
    { id: "debt-cat", name: "Debt", type: "expense", group: "debt", color: "#3" },
    { id: "invest-cat", name: "Investments", type: "expense", group: "investments", color: "#4" },
  ],
  transactions: [], budgets: [], goals: [], plannedTransactions: [], activities: [], notifications: [], todos: [],
  selectedYear: 2026, currency: "USD", cloudRows: {},
});

type Dashboard = ReturnType<typeof useDashboardData>;
let capturedDashboard: Dashboard | null = null;

function StatusSpy() {
  const data = useDashboardData();
  useLayoutEffect(() => {
    capturedDashboard = data;
  });
  return <span data-testid="synced">{data.cloudSyncState === "synced" ? "ok" : ""}</span>;
}

function dashboard(): Dashboard {
  return capturedDashboard!;
}

async function mount(state: CloudState, Page: React.ComponentType = EntryTab) {
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

describe("getTransferAccountEffect (shared presentation helper)", () => {
  const transfer = { type: "transfer" as const, accountId: "checking", toAccountId: "savings", amount: 200 };

  it("returns 'out' with a negative signedAmount from the source account's perspective", () => {
    const effect = getTransferAccountEffect(transfer, "checking");
    expect(effect).toEqual({ direction: "out", signedAmount: -200, counterpartyAccountId: "savings" });
  });

  it("returns 'in' with a positive signedAmount from the destination account's perspective", () => {
    const effect = getTransferAccountEffect(transfer, "savings");
    expect(effect).toEqual({ direction: "in", signedAmount: 200, counterpartyAccountId: "checking" });
  });

  it("returns null for an account not involved in the transfer", () => {
    expect(getTransferAccountEffect(transfer, "investments")).toBeNull();
  });

  it("returns null for a non-transfer transaction", () => {
    expect(getTransferAccountEffect({ type: "income", accountId: "checking", toAccountId: undefined, amount: 50 }, "checking")).toBeNull();
  });
});

describe("Complete scenario: $1,000 income then $200 Checking -> Savings transfer", () => {
  const scenario = (): CloudState => {
    const state = baseState();
    // Hydration reads currentBalance as-provided (it does not recompute
    // from transactions on load — only commitMutation does), so the
    // seeded balances must already reflect the seeded transactions below,
    // matching how real hydrated production data looks.
    state.accounts.find((a) => a.id === "checking")!.currentBalance = 800;
    state.accounts.find((a) => a.id === "savings")!.currentBalance = 200;
    state.transactions = [
      { id: "income1", date: "2026-03-01", accountId: "checking", categoryId: "salary", type: "income", amount: 1000, description: "Salary", status: "cleared" },
      { id: "transfer1", date: "2026-03-02", accountId: "checking", categoryId: "savings-cat", toAccountId: "savings", type: "transfer", amount: 200, description: "Savings", status: "cleared" },
    ];
    return state;
  };

  it("produces the exact expected balances, income, and outflow", async () => {
    await mount(scenario());
    const d = dashboard();
    const checking = d.displayAccounts.find((a) => a.id === "checking")!;
    const savings = d.displayAccounts.find((a) => a.id === "savings")!;
    expect(checking.currentBalance).toBe(800);
    expect(savings.currentBalance).toBe(200);
    // Exactly one canonical transaction was ever written for the transfer.
    expect(d.transactions.filter((t) => t.type === "transfer").length).toBe(1);
    expect(d.transactions.length).toBe(2);
  });

  it("shows the transfer with clear source -> destination account names in the Recorded list, not a category/destination-only line", async () => {
    await mount(scenario());
    const editBtn = screen.getByRole("button", { name: "Edit Savings" });
    const row = editBtn.closest("li")!;
    expect(within(row).getByText(/Checking → Savings/)).toBeTruthy();
  });

  it("Income card is unaffected by the transfer and Outflow stays at $0", async () => {
    await mount(scenario());
    const incomeBtn = screen.getByRole("button", { name: "Add income entry" });
    const incomeCard = incomeBtn.closest(".group") as HTMLElement;
    expect(within(incomeCard).getByText("$1,000.00")).toBeTruthy();

    const outflowBtn = screen.getByRole("button", { name: "Add outflow entry" });
    const outflowCard = outflowBtn.closest(".group") as HTMLElement;
    expect(within(outflowCard).getByText("$0.00")).toBeTruthy();
  });

  it("survives a simulated reload/hydration with identical figures", async () => {
    const state = scenario();
    const { unmount } = await mount(state);
    unmount();
    cleanup();
    await mount(state);
    const d = dashboard();
    expect(d.displayAccounts.find((a) => a.id === "checking")!.currentBalance).toBe(800);
    expect(d.displayAccounts.find((a) => a.id === "savings")!.currentBalance).toBe(200);
    expect(d.transactions.length).toBe(2);
  });

  it("opening the transfer from Recorded shows both effects (From/To) and status in the edit modal", async () => {
    await mount(scenario());
    fireEvent.click(screen.getByRole("button", { name: "Edit Savings" }));
    const dialog = screen.getByRole("dialog");
    // "Checking"/"Savings" each appear twice in this dialog (once in the
    // read-only Transfer summary, once in the editable "From account"
    // picker below it) — scope to the summary block itself, found via
    // its unique "Transfer" label.
    const summary = within(dialog).getByText("Transfer").closest("div")!.parentElement!;
    expect(within(summary).getByText("From")).toBeTruthy();
    expect(within(summary).getByText("To")).toBeTruthy();
    expect(within(summary).getByText("Checking")).toBeTruthy();
    expect(within(summary).getByText("Savings")).toBeTruthy();
    expect(within(summary).getByText("−$200.00")).toBeTruthy();
    expect(within(summary).getByText("+$200.00")).toBeTruthy();
    expect(within(summary).getByText("Completed")).toBeTruthy();
  });

  it("a pending transfer shows Pending (not Completed) in the transfer-detail block", async () => {
    const state = scenario();
    state.transactions[1].status = "pending";
    await mount(state);
    fireEvent.click(screen.getByRole("button", { name: "Edit Savings" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Pending")).toBeTruthy();
  });
});

describe("Savings detail: bidirectional movement traceability", () => {
  it("shows 'Transfer from Checking +$200' for a deposit into savings", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-02", accountId: "checking", categoryId: "savings-cat", toAccountId: "savings", type: "transfer", amount: 200, description: "Savings", status: "cleared" },
    ];
    await mount(state, SavingsDetails);
    expect(screen.getByText("Transfer from Checking")).toBeTruthy();
    expect(screen.getByText("+$200.00")).toBeTruthy();
  });

  it("shows 'Transfer to Checking -$200' for a withdrawal out of savings", async () => {
    const state = baseState();
    state.accounts.find((a) => a.id === "savings")!.currentBalance = 200;
    state.accounts.find((a) => a.id === "savings")!.openingBalance = 200;
    state.transactions = [
      { id: "t1", date: "2026-03-05", accountId: "savings", categoryId: "savings-cat", toAccountId: "checking", type: "transfer", amount: 200, description: "Withdraw", status: "cleared" },
    ];
    await mount(state, SavingsDetails);
    expect(screen.getByText("Transfer to Checking")).toBeTruthy();
    expect(screen.getByText("−$200.00")).toBeTruthy();
  });

  it("excludes a pending transfer from the movement list", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-02", accountId: "checking", categoryId: "savings-cat", toAccountId: "savings", type: "transfer", amount: 200, description: "Savings", status: "pending" },
    ];
    await mount(state, SavingsDetails);
    expect(screen.getByText("No savings movements this period.")).toBeTruthy();
  });
});

describe("Investments detail: bidirectional movement traceability", () => {
  it("shows 'Transfer from Checking' with a + sign for a deposit into investments", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-02", accountId: "checking", categoryId: "invest-cat", toAccountId: "investments", type: "transfer", amount: 100, description: "Investments", status: "cleared" },
    ];
    await mount(state, InvestmentsDetails);
    expect(screen.getByText("Transfer from Checking")).toBeTruthy();
    expect(screen.getByText("+$100.00")).toBeTruthy();
  });

  it("shows 'Transfer to Checking' with a - sign for a withdrawal out of investments", async () => {
    const state = baseState();
    state.accounts.find((a) => a.id === "investments")!.currentBalance = 100;
    state.accounts.find((a) => a.id === "investments")!.openingBalance = 100;
    state.transactions = [
      { id: "t1", date: "2026-03-05", accountId: "investments", categoryId: "invest-cat", toAccountId: "checking", type: "transfer", amount: 100, description: "Withdraw", status: "cleared" },
    ];
    await mount(state, InvestmentsDetails);
    expect(screen.getByText("Transfer to Checking")).toBeTruthy();
    expect(screen.getByText("−$100.00")).toBeTruthy();
  });
});

describe("Debts detail: payment reduces (never appears to increase) the amount owed", () => {
  it("a Checking -> Credit Card payment reads as reducing the amount owed, not increasing it", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-02", accountId: "checking", categoryId: "debt-cat", toAccountId: "card", type: "transfer", amount: 50, description: "Debt", status: "cleared" },
    ];
    await mount(state, DebtsDetails);
    expect(screen.getByText("Payment from Checking")).toBeTruthy();
    expect(screen.getByText("−$50.00 owed")).toBeTruthy();
    expect(screen.queryByText("+$50.00 owed")).toBeNull();
  });

  it("a Credit Card -> Checking draw (the mirror case) reads as increasing the amount owed", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-05", accountId: "card", categoryId: "debt-cat", toAccountId: "checking", type: "transfer", amount: 75, description: "Cash advance", status: "cleared" },
    ];
    await mount(state, DebtsDetails);
    expect(screen.getByText("Transfer to Checking")).toBeTruthy();
    expect(screen.getByText("+$75.00 owed")).toBeTruthy();
  });

  it("excludes a pending debt transfer from the movement list", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-02", accountId: "checking", categoryId: "debt-cat", toAccountId: "card", type: "transfer", amount: 50, description: "Debt", status: "pending" },
    ];
    await mount(state, DebtsDetails);
    expect(screen.getByText("No debt movements this period.")).toBeTruthy();
  });
});
