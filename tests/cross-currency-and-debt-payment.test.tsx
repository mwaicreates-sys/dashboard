// Follow-up correctness fix — full integration coverage through the real
// EntryTab + EntryForm:
//   C. a $500 debt payment against a credit_card account behaves exactly
//      like any other debt account (net worth/outflow untouched).
//   D-I. cross-currency transfers are blocked for every asset-move card
//      (Savings/Debt/Investments) — same-currency continues to work,
//      differently-denominated accounts are rejected with no balance
//      mutation, no persisted transaction, and no false success.
// @vitest-environment jsdom
import React, { useLayoutEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const baseState = (): CloudState => ({
  accounts: [
    { id: "checking", name: "Checking", type: "checking", openingBalance: 10000, currentBalance: 10000, currency: "USD", active: true },
    { id: "card", name: "Credit Card", type: "credit_card", openingBalance: -2000, currentBalance: -2000, currency: "USD", active: true },
    { id: "savings", name: "Savings", type: "savings", openingBalance: 3000, currentBalance: 3000, currency: "USD", active: true },
    { id: "investments", name: "Investments", type: "investment", openingBalance: 1000, currentBalance: 1000, currency: "USD", active: true },
    { id: "kesSavings", name: "KES Savings", type: "savings", openingBalance: 50000, currentBalance: 50000, currency: "KES", active: true },
    { id: "kesInvest", name: "KES Investments", type: "investment", openingBalance: 20000, currentBalance: 20000, currency: "KES", active: true },
    { id: "kesCard", name: "KES Credit Card", type: "credit_card", openingBalance: -10000, currentBalance: -10000, currency: "KES", active: true },
  ],
  categories: [],
  transactions: [], budgets: [], goals: [], plannedTransactions: [], activities: [], notifications: [], todos: [],
  selectedYear: 2026, currency: "USD", cloudRows: {},
});

let dashboard: ReturnType<typeof useDashboardData>;
function Probe() {
  const data = useDashboardData();
  useLayoutEffect(() => { dashboard = data; }, [data]);
  return <span data-testid="status">{data.cloudSyncState}</span>;
}

async function mountSynced(state: CloudState = baseState()) {
  mocks.pull.mockResolvedValue(state);
  render(<DashboardProvider><Probe /><EntryTab /></DashboardProvider>);
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
}

const netWorth = () => dashboard.accounts.reduce((sum, a) => sum + a.currentBalance, 0);
const acctBal = (id: string) => dashboard.accounts.find((a) => a.id === id)?.currentBalance;
const realizedOutflow = () =>
  dashboard.transactions.filter((t) => t.type === "expense" && t.status !== "pending").reduce((s, t) => s + t.amount, 0);

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  mocks.businesses.mockResolvedValue([{ id: "business-a", name: "A", slug: null, currency: "USD", role: "owner" }]);
  mocks.push.mockImplementation(async (_id, next) => ({ ...next, cloudRows: {} }));
});
afterEach(cleanup);

describe("C. debt payment against a credit_card account", () => {
  it("$500 toward a credit_card debt: Checking 10000->9500, card -2000->-1500, debt 2000->1500, net worth unchanged, outflow unchanged", async () => {
    // Only one debt-type account (the credit_card) so it's inferred silently.
    const state = baseState();
    state.accounts = state.accounts.filter((a) => a.id === "checking" || a.id === "card");
    await mountSynced(state);
    const before = netWorth();
    expect(before).toBe(8000); // 10000 - 2000

    fireEvent.click(screen.getByRole("button", { name: "Add debt entry" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "500" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add debt payment" }));

    await waitFor(() => expect(acctBal("checking")).toBe(9500));
    expect(acctBal("card")).toBe(-1500);
    const debtNow = Math.abs(dashboard.accounts.find((a) => a.id === "card")!.currentBalance);
    expect(debtNow).toBe(1500);
    expect(netWorth()).toBe(before); // 8000, unchanged — moved, not spent
    expect(realizedOutflow()).toBe(0);
  });
});

describe("Same-currency asset-move transfers succeed (D, E, F)", () => {
  it("D. same-currency Savings transfer succeeds", async () => {
    const state = baseState();
    state.accounts = state.accounts.filter((a) => ["checking", "savings"].includes(a.id));
    await mountSynced(state);
    fireEvent.click(screen.getByRole("button", { name: "Add savings entry" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "100" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to savings" }));
    await waitFor(() => expect(acctBal("checking")).toBe(9900));
    expect(acctBal("savings")).toBe(3100);
  });

  it("E. same-currency Investments transfer succeeds", async () => {
    const state = baseState();
    state.accounts = state.accounts.filter((a) => ["checking", "investments"].includes(a.id));
    await mountSynced(state);
    fireEvent.click(screen.getByRole("button", { name: "Add investments entry" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "200" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add investment" }));
    await waitFor(() => expect(acctBal("checking")).toBe(9800));
    expect(acctBal("investments")).toBe(1200);
  });

  it("F. same-currency Debt payment succeeds", async () => {
    const state = baseState();
    state.accounts = state.accounts.filter((a) => ["checking", "card"].includes(a.id));
    await mountSynced(state);
    fireEvent.click(screen.getByRole("button", { name: "Add debt entry" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "300" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add debt payment" }));
    await waitFor(() => expect(acctBal("checking")).toBe(9700));
    expect(acctBal("card")).toBe(-1700);
  });
});

describe("Cross-currency asset-move transfers are rejected (G, H, I)", () => {
  it("G. USD Checking -> KES Savings is rejected: no balance change, no transaction, error shown", async () => {
    const state = baseState();
    state.accounts = state.accounts.filter((a) => ["checking", "kesSavings"].includes(a.id));
    await mountSynced(state);
    fireEvent.click(screen.getByRole("button", { name: "Add savings entry" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "100" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });

    expect(within(dialog).getByRole("alert").textContent).toContain("Transfers between different currencies aren't supported yet.");
    const saveButton = within(dialog).getByRole("button", { name: "Add to savings" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(saveButton); // disabled — must not submit

    expect(mocks.push).not.toHaveBeenCalled();
    expect(acctBal("checking")).toBe(10000);
    expect(acctBal("kesSavings")).toBe(50000);
    expect(dashboard.transactions).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeTruthy(); // still open — no false success
  });

  it("H. USD Checking -> KES Investments is rejected: no balance change, no transaction", async () => {
    const state = baseState();
    state.accounts = state.accounts.filter((a) => ["checking", "kesInvest"].includes(a.id));
    await mountSynced(state);
    fireEvent.click(screen.getByRole("button", { name: "Add investments entry" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "100" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });

    expect(within(dialog).getByRole("alert").textContent).toContain("Transfers between different currencies aren't supported yet.");
    const saveButton = within(dialog).getByRole("button", { name: "Add investment" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(saveButton);

    expect(mocks.push).not.toHaveBeenCalled();
    expect(acctBal("checking")).toBe(10000);
    expect(acctBal("kesInvest")).toBe(20000);
    expect(dashboard.transactions).toHaveLength(0);
  });

  it("I. USD Checking -> KES Credit Card debt payment is rejected: no balance change, no transaction", async () => {
    const state = baseState();
    state.accounts = state.accounts.filter((a) => ["checking", "kesCard"].includes(a.id));
    await mountSynced(state);
    fireEvent.click(screen.getByRole("button", { name: "Add debt entry" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "100" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "checking" } });

    expect(within(dialog).getByRole("alert").textContent).toContain("Transfers between different currencies aren't supported yet.");
    const saveButton = within(dialog).getByRole("button", { name: "Add debt payment" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(saveButton);

    expect(mocks.push).not.toHaveBeenCalled();
    expect(acctBal("checking")).toBe(10000);
    expect(acctBal("kesCard")).toBe(-10000);
    expect(dashboard.transactions).toHaveLength(0);
  });
});
