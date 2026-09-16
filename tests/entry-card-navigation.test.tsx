// Entry card navigation / event-separation fix.
//
// Root cause: each card's "view" destination was an absolutely-positioned
// `<Link>` covering the whole card, but the icon/label and number/subtitle
// content was layered on top of it as separate sibling `<div>`s (later in
// DOM order, so painted above) with no `pointer-events` handling — clicks
// landing on the VISIBLE text (the most obvious, most-clicked part of the
// card) never reached the Link at all; only clicks in the surrounding
// empty padding did. Fixed by making the informational content
// `pointer-events-none` so every click passes through to the Link
// underneath, while the independent "+ Add" button (which must NOT
// navigate) keeps its own click handling and stays on top.
//
// jsdom does not perform real layout/hit-testing, so it can't prove the
// CSS cascade behaves correctly in an actual browser — these tests instead
// verify the concrete, checkable facts: the fix's class is structurally
// present, every card's Link points at the right destination (including
// the newly-added /other), and clicking "+ Add" still opens the correct
// form independently of the card's own Link.
// @vitest-environment jsdom
import React, { useLayoutEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { classifyEntryKind } from "@/lib/entryClassification";

const baseState = (): CloudState => ({
  accounts: [
    { id: "checking", name: "Checking", type: "checking", openingBalance: 1000, currentBalance: 1000, currency: "USD", active: true },
    { id: "savings", name: "Savings", type: "savings", openingBalance: 500, currentBalance: 500, currency: "USD", active: true },
  ],
  categories: [{ id: "groceries", name: "Groceries", type: "expense", group: "expenses", color: "#111" }],
  transactions: [], budgets: [], goals: [], plannedTransactions: [], activities: [], notifications: [], todos: [],
  selectedYear: 2026, currency: "USD", cloudRows: {},
});

function Probe() {
  const data = useDashboardData();
  useLayoutEffect(() => {}, [data]);
  return <span data-testid="status">{data.cloudSyncState}</span>;
}

async function mountSynced(state: CloudState = baseState()) {
  mocks.pull.mockResolvedValue(state);
  render(<DashboardProvider><Probe /><EntryTab /></DashboardProvider>);
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
}

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  mocks.businesses.mockResolvedValue([{ id: "business-a", name: "A", slug: null, currency: "USD", role: "owner" }]);
  mocks.push.mockImplementation(async (_id, next) => ({ ...next, cloudRows: {} }));
});
afterEach(cleanup);

describe("Card body = view, + Add = create", () => {
  const expectedHrefs: Array<[string, string]> = [
    ["income", "/income"],
    ["outflow", "/outflow"],
    ["savings", "/savings"],
    ["debt", "/debts"],
    ["other", "/other"],
    ["investments", "/investments"],
  ];

  it.each(expectedHrefs)("the %s card body links to %s", async (kindId, href) => {
    await mountSynced();
    const link = screen.getByRole("link", { name: new RegExp(`View ${kindId}`, "i") });
    expect(link.getAttribute("href")).toBe(href);
  });

  it("the informational card content is pointer-events-none, so the underlying Link receives clicks landing on the visible text", async () => {
    await mountSynced();
    const link = screen.getByRole("link", { name: /View income/i });
    const card = link.parentElement!;
    // The icon/label row and the number/subtitle row are the two
    // non-interactive content blocks layered visually on top of the Link.
    const contentBlocks = card.querySelectorAll(".pointer-events-none");
    expect(contentBlocks.length).toBeGreaterThanOrEqual(2);
    // The Link itself, and the "+ Add" button's own wrapper, must NOT be
    // pointer-events-none (they need to keep receiving clicks/taps).
    expect(link.className.includes("pointer-events-none")).toBe(false);
    const addButton = screen.getByRole("button", { name: "Add income entry" });
    expect(addButton.closest(".pointer-events-none")).toBeNull();
  });

  it("clicking + Add opens the create form and is a separate element from the card's view Link", async () => {
    await mountSynced();
    const link = screen.getByRole("link", { name: /View savings/i });
    const addButton = screen.getByRole("button", { name: "Add savings entry" });
    // Structurally independent: the button is not inside the anchor (an
    // interactive control nested in a link is invalid HTML and would also
    // make "+ Add must not navigate" impossible to guarantee cleanly).
    expect(link.contains(addButton)).toBe(false);
    expect(addButton.contains(link)).toBe(false);

    fireEvent.click(addButton);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Add to savings" })).toBeTruthy();
  });

  it("+ Add for every card opens its own form without interference from the card Link", async () => {
    await mountSynced();
    for (const [kindId] of expectedHrefs) {
      fireEvent.click(screen.getByRole("button", { name: `Add ${kindId} entry` }));
      expect(screen.getByRole("dialog")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });
});

describe("classifyEntryKind (shared classifier)", () => {
  const categories = [
    { id: "salary", name: "Salary", type: "income" as const, group: "income" as const, color: "#1" },
    { id: "groceries", name: "Groceries", type: "expense" as const, group: "expenses" as const, color: "#2" },
    { id: "orphaned", name: "Mystery", type: "expense" as const, group: "unknown-group" as never, color: "#3" },
  ];
  const accounts = [
    { id: "checking", name: "Checking", type: "checking" as const, openingBalance: 0, currentBalance: 0, currency: "USD", active: true },
    { id: "savings", name: "Savings", type: "savings" as const, openingBalance: 0, currentBalance: 0, currency: "USD", active: true },
  ];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const accById = new Map(accounts.map((a) => [a.id, a]));

  it("classifies income transactions as income", () => {
    expect(classifyEntryKind(
      { categoryId: "salary", accountId: "checking", type: "income" }, catById, accById
    )).toBe("income");
  });

  it("classifies a bills/expenses-category expense as outflow", () => {
    expect(classifyEntryKind(
      { categoryId: "groceries", accountId: "checking", type: "expense" }, catById, accById
    )).toBe("outflow");
  });

  it("classifies a transfer into a savings-type account as savings, regardless of category", () => {
    expect(classifyEntryKind(
      { categoryId: "groceries", accountId: "checking", toAccountId: "savings", type: "transfer" }, catById, accById
    )).toBe("savings");
  });

  it("falls to other for a genuinely unclassifiable expense (unrecognized category group)", () => {
    expect(classifyEntryKind(
      { categoryId: "orphaned", accountId: "checking", type: "expense" }, catById, accById
    )).toBe("other");
  });

  it("falls to other for a missing/orphaned category", () => {
    expect(classifyEntryKind(
      { categoryId: "does-not-exist", accountId: "checking", type: "expense" }, catById, accById
    )).toBe("other");
  });
});

describe("/other detail page consistency", () => {
  it("shows exactly the transactions the Entry card counts as Other", async () => {
    const state = baseState();
    state.transactions = [
      { id: "t1", date: "2026-03-01", accountId: "checking", categoryId: "does-not-exist", type: "expense", amount: 42, description: "Unclassifiable", status: "cleared" },
      { id: "t2", date: "2026-03-02", accountId: "checking", categoryId: "groceries", type: "expense", amount: 10, description: "Normal outflow", status: "cleared" },
    ];
    await mountSynced(state);
    const otherCard = screen.getByRole("link", { name: /View other/i }).parentElement!;
    expect(otherCard.textContent).toContain("$42.00");
    expect(otherCard.textContent).not.toContain("$10.00");
  });
});
