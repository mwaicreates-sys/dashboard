// Simplified Entry experience — the six dashboard cards (Income, Outflow,
// Savings, Debt, Other, Investments) each now show only the fields their
// intent genuinely requires, and Savings/Debt/Investments record a real
// `type: "transfer"` between accounts instead of a category-tagged
// expense. This drives the REAL EntryTab + its real KINDS array (not a
// synthetic test kind) so the actual card behavior is under test.
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
// SearchableSelect renders a listbox popover that's awkward to drive with
// fireEvent in jsdom; replaced with a plain <select> for these tests only
// (same pattern as tests/entry-provider.test.tsx), so the real EntryForm
// submit/validation/save path still runs unmocked.
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
    { id: "paycheck", name: "Paycheck", type: "checking", openingBalance: 2000, currentBalance: 2000, currency: "USD", active: true },
    { id: "mpesa", name: "M-Pesa", type: "checking", openingBalance: 500, currentBalance: 500, currency: "USD", active: true },
    { id: "savings", name: "Emergency Fund", type: "savings", openingBalance: 5400, currentBalance: 5400, currency: "USD", active: true },
  ],
  categories: [
    { id: "groceries", name: "Groceries", type: "expense", group: "expenses", color: "#111" },
  ],
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
const realizedIncome = () =>
  dashboard.transactions.filter((t) => t.type === "income" && t.status !== "pending").reduce((s, t) => s + t.amount, 0);

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  mocks.businesses.mockResolvedValue([{ id: "business-a", name: "A", slug: null, currency: "USD", role: "owner" }]);
  mocks.push.mockImplementation(async (_id, next) => ({ ...next, cloudRows: {} }));
});
afterEach(cleanup);

describe("Income — simplified form", () => {
  it("shows only Amount/Date/Account/Source, and recording $2,000 into Paycheck increases the account and realized income", async () => {
    await mountSynced();
    fireEvent.click(screen.getByRole("button", { name: "Add income entry" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add income" })).toBeTruthy();
    // Fields that must NOT appear on Income:
    expect(within(dialog).queryByLabelText("Select category…")).toBeNull();
    expect(within(dialog).queryByText("Transfer between accounts")).toBeNull();
    expect(within(dialog).queryByText("Schedule for later")).toBeNull();
    expect(within(dialog).queryByLabelText("Status")).toBeNull();

    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "2000" } });
    fireEvent.change(within(dialog).getByLabelText("Source"), { target: { value: "Salary" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "paycheck" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add income" }));

    await waitFor(() => expect(acctBal("paycheck")).toBe(4000));
    expect(realizedIncome()).toBe(2000);
    const tx = dashboard.transactions.find((t) => t.description === "Salary")!;
    expect(tx.type).toBe("income");
    expect(tx.accountId).toBe("paycheck");
  });
});

describe("Outflow — simplified form", () => {
  it("shows Category/Account/Note primary, Schedule+Status behind More options; $100 Groceries from M-Pesa decreases the account and increases realized outflow", async () => {
    await mountSynced();
    fireEvent.click(screen.getByRole("button", { name: "Add outflow entry" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Schedule for later")).toBeNull();
    expect(within(dialog).queryByLabelText("Status")).toBeNull();
    expect(within(dialog).getByText("More options")).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "100" } });
    const categorySelect = within(dialog).getAllByRole("combobox").find((n) => n.textContent?.includes("Groceries"))!;
    fireEvent.change(categorySelect, { target: { value: "groceries" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "mpesa" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add outflow" }));

    await waitFor(() => expect(acctBal("mpesa")).toBe(400));
    expect(realizedOutflow()).toBe(100);
  });

  it("keeps Schedule for later available behind More options", async () => {
    await mountSynced();
    fireEvent.click(screen.getByRole("button", { name: "Add outflow entry" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "More options" }));
    expect(within(dialog).getByText("Schedule for later")).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "50" } });
    const categorySelect = within(dialog).getAllByRole("combobox").find((n) => n.textContent?.includes("Groceries"))!;
    fireEvent.change(categorySelect, { target: { value: "groceries" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "mpesa" } });
    // The toggle button's accessible name is its full text (title +
    // helper line); click the title span itself — the click still
    // bubbles to the button's onClick.
    fireEvent.click(within(dialog).getByText("Schedule for later"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Schedule outflow" }));

    await waitFor(() => expect(dashboard.plannedTransactions).toHaveLength(1));
    expect(acctBal("mpesa")).toBe(500); // unchanged — scheduled, not realized
    expect(realizedOutflow()).toBe(0);
  });
});

describe("Savings — simplified form (the core correction)", () => {
  it("shows ONLY Amount/From account/Date/Note — no category, no transfer toggle, no status, no schedule, no destination picker (single savings account is inferred)", async () => {
    await mountSynced();
    fireEvent.click(screen.getByRole("button", { name: "Add savings entry" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add to savings" })).toBeTruthy();
    expect(within(dialog).queryByLabelText("Select category…")).toBeNull();
    expect(within(dialog).queryByText("Transfer between accounts")).toBeNull();
    expect(within(dialog).queryByLabelText("Status")).toBeNull();
    expect(within(dialog).queryByText("Schedule for later")).toBeNull();
    // Destination is inferred silently (exactly one savings account) — shown as text, not a field.
    expect(within(dialog).getAllByText("Emergency Fund").length).toBeGreaterThan(0);
    expect(within(dialog).queryByLabelText(/savings account/i)).toBeNull(); // not asked — inferred
  });

  it("moving $500 from Paycheck to savings: Paycheck -500, Savings +500, net worth unchanged, outflow unchanged", async () => {
    await mountSynced();
    fireEvent.click(screen.getByRole("button", { name: "Add savings entry" }));
    const dialog = screen.getByRole("dialog");
    const before = netWorth();

    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "500" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "paycheck" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to savings" }));

    await waitFor(() => expect(acctBal("paycheck")).toBe(1500));
    expect(acctBal("savings")).toBe(5900);
    expect(netWorth()).toBe(before); // moved, not spent
    expect(realizedOutflow()).toBe(0); // must NOT count as outflow

    const tx = dashboard.transactions.find((t) => t.accountId === "paycheck" && t.toAccountId === "savings")!;
    expect(tx.type).toBe("transfer");
  });

  it("recording a second savings entry reuses the same auto-created category (no accidental duplicate category creation)", async () => {
    await mountSynced();
    const addOnce = async (amount: string) => {
      fireEvent.click(screen.getByRole("button", { name: "Add savings entry" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: amount } });
      fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "paycheck" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Add to savings" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    };
    await addOnce("100");
    await addOnce("200");
    const savingsCategoryIds = new Set(
      dashboard.transactions.filter((t) => t.accountId === "paycheck" && t.toAccountId === "savings").map((t) => t.categoryId)
    );
    expect(savingsCategoryIds.size).toBe(1);
    expect(dashboard.categories.filter((c) => c.group === "savings")).toHaveLength(1);
  });
});

describe("Investments — simplified form", () => {
  it("moving $1,000 from Checking to a newly-created Investments account: Checking -1000, Investments +1000, net worth unchanged, outflow unchanged", async () => {
    const state = baseState();
    state.accounts[0] = { ...state.accounts[0], name: "Checking" };
    await mountSynced(state);
    fireEvent.click(screen.getByRole("button", { name: "Add investments entry" }));
    const dialog = screen.getByRole("dialog");
    // No investment account exists yet — the app asks to create the ONE
    // thing it genuinely cannot infer, instead of faking a transfer.
    expect(within(dialog).getByRole("button", { name: "Add investments account" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add investments account" }));
    const accountDialog = screen.getAllByRole("dialog").find((d) => within(d).queryByRole("heading", { name: "Add investments account" }))!;
    fireEvent.change(within(accountDialog).getByLabelText("Account name"), { target: { value: "Brokerage" } });
    fireEvent.click(within(accountDialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByText("Add investments account")).toBeNull());

    const before = netWorth();
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "1000" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "paycheck" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add investment" }));

    await waitFor(() => expect(acctBal("paycheck")).toBe(1000));
    const invAccount = dashboard.accounts.find((a) => a.name === "Brokerage")!;
    expect(invAccount.currentBalance).toBe(1000);
    expect(netWorth()).toBe(before);
    expect(realizedOutflow()).toBe(0);
  });
});

describe("Debt — simplified form", () => {
  it("paying $500 toward a $5,000 debt: Checking -500, debt account balance moves from -5000 to -4500 (owed amount drops from 5000 to 4500), outflow unchanged", async () => {
    const state = baseState();
    state.accounts.push({ id: "card", name: "Credit Card", type: "credit", openingBalance: -5000, currentBalance: -5000, currency: "USD", active: true });
    await mountSynced(state);
    fireEvent.click(screen.getByRole("button", { name: "Add debt entry" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add debt payment" })).toBeTruthy();
    expect(within(dialog).getAllByText("Credit Card").length).toBeGreaterThan(0);

    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "500" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "paycheck" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add debt payment" }));

    await waitFor(() => expect(acctBal("paycheck")).toBe(1500));
    expect(acctBal("card")).toBe(-4500); // owed 5000 -> 4500
    expect(realizedOutflow()).toBe(0);
  });
});

describe("Other — simplified form", () => {
  it("requires a description and still exposes category/account/type", async () => {
    await mountSynced();
    fireEvent.click(screen.getByRole("button", { name: "Add other entry" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Description")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "20" } });
    expect((within(dialog).getByRole("button", { name: "Add other" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Cross-cutting durability/validation checks", () => {
  it("Supabase rejection on a savings transfer surfaces an error and does not close the form", async () => {
    await mountSynced();
    mocks.push.mockRejectedValueOnce(new Error("write rejected"));
    fireEvent.click(screen.getByRole("button", { name: "Add savings entry" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "500" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "paycheck" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to savings" }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("write rejected"));
    expect(screen.getByRole("dialog")).toBeTruthy(); // still open — no fake success
  });

  it("double-clicking Save on an outflow entry disables the button after the first click, and only one transaction is ever created", async () => {
    await mountSynced();
    let release!: () => void;
    mocks.push.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ ...baseState(), cloudRows: {} });
    }));
    fireEvent.click(screen.getByRole("button", { name: "Add outflow entry" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "50" } });
    const categorySelect = within(dialog).getAllByRole("combobox").find((n) => n.textContent?.includes("Groceries"))!;
    fireEvent.change(categorySelect, { target: { value: "groceries" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "mpesa" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add outflow" }));
    const savingButton = within(dialog).getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(savingButton.disabled).toBe(true);
    // A disabled button does not dispatch click in the DOM — the guard is
    // structural, not just a race the test happens not to hit.
    fireEvent.click(savingButton);
    await act(async () => { release(); });
    await waitFor(() => expect(dashboard.transactions.filter((t) => t.description === "Outflow" || t.categoryId === "groceries")).toHaveLength(1));
  });

  it("reload: a savings transfer survives a fresh cloud pull", async () => {
    await mountSynced();
    fireEvent.click(screen.getByRole("button", { name: "Add savings entry" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount in USD"), { target: { value: "500" } });
    fireEvent.change(within(dialog).getByLabelText("Select account…"), { target: { value: "paycheck" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to savings" }));
    await waitFor(() => expect(acctBal("paycheck")).toBe(1500));
    const pushed = mocks.push.mock.calls.at(-1)?.[1] as CloudState;
    expect(pushed.transactions.some((t) => t.toAccountId === "savings" && t.amount === 500)).toBe(true);
    expect(pushed.accounts.find((a) => a.id === "savings")?.currentBalance).toBe(5900);
  });
});
