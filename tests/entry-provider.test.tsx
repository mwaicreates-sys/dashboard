// @vitest-environment jsdom
import React, { StrictMode, useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CloudState } from "@/lib/cloudSync";

const mocks = vi.hoisted(() => ({ pull: vi.fn(), push: vi.fn(), businesses: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseBrowserClient: () => ({ auth: {
    getUser: async () => ({ data: { user: { id: "user-a", email: "test@example.invalid" } } }),
    signOut: mocks.signOut,
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
vi.mock("@/components/shell/SearchableSelect", () => ({ SearchableSelect: ({ value, onChange, items, placeholder }: {
  value: string; onChange: (value: string) => void; items: { id: string; label: string }[]; placeholder: string;
}) => <select aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)}>
  <option value="">Choose</option>{items.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
</select> }));

import { DashboardProvider, useDashboardData } from "@/lib/dashboardData";
import { EntryForm } from "@/components/shell/EntryForm";
import { CloudAccountCard } from "@/components/shell/CloudAccountCard";

const initial = (): CloudState => ({
  accounts: [{ id: "a", name: "Cash", type: "checking", openingBalance: 100, currentBalance: 100, currency: "USD", active: true }],
  categories: [{ id: "c", name: "Food", type: "expense", group: "expenses", color: "#112233" }],
  transactions: [], budgets: [], goals: [], plannedTransactions: [], activities: [], notifications: [], todos: [],
  selectedYear: 2026, currency: "USD", cloudRows: {},
});
let dashboard: ReturnType<typeof useDashboardData>;
const closed = vi.fn();
function Probe({ form = false }: { form?: boolean }) {
  const data = useDashboardData();
  useLayoutEffect(() => { dashboard = data; }, [data]);
  return <>
    <span data-testid="status">{data.cloudSyncState}</span>
    <span data-testid="entries">{data.transactions.map((t) => t.description).join(",")}</span>
    {form && <EntryForm kind={{ id: "expenses", label: "Expense", groups: ["expenses"], defaultType: "expense", chooseType: false, transferToggle: false }} onClose={closed} />}
  </>;
}
beforeEach(() => {
  localStorage.clear(); vi.resetAllMocks();
  mocks.businesses.mockResolvedValue([{ id: "business-a", name: "A", slug: null, currency: "USD", role: "owner" }]);
  mocks.pull.mockResolvedValue(initial());
  mocks.push.mockImplementation(async (_id, next) => ({ ...next, cloudRows: {} }));
});
afterEach(cleanup);

it("never renders a foreign cache and never pushes before successful hydration", async () => {
  localStorage.setItem("budgeting-dashboard-v2-transactions", JSON.stringify([{ id: "foreign", description: "Foreign data" }]));
  let resolve!: (value: CloudState) => void;
  mocks.pull.mockReturnValue(new Promise<CloudState>((r) => { resolve = r; }));
  render(<StrictMode><DashboardProvider><Probe /></DashboardProvider></StrictMode>);
  await waitFor(() => expect(mocks.pull).toHaveBeenCalled());
  expect(screen.getByTestId("entries").textContent).toBe("");
  expect(mocks.push).not.toHaveBeenCalled();
  await act(async () => { resolve(initial()); });
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
  expect(mocks.push).not.toHaveBeenCalled();
});

it("failed hydration cannot enable writes or replace cloud with local defaults", async () => {
  mocks.pull.mockRejectedValue(new Error("read failed"));
  render(<DashboardProvider><Probe /></DashboardProvider>);
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("offline"));
  act(() => dashboard.setSelectedYear(2025));
  await expect(dashboard.saveEntry({ id: "tx-test", date: "2026-09-15", accountId: "a", categoryId: "c", type: "expense", amount: 2, description: "unsaved", status: "cleared" })).rejects.toThrow("not ready");
  expect(mocks.push).not.toHaveBeenCalled();
});

it("Entry stays open during commit, reports failure, and retries the same ID", async () => {
  let reject!: (error: Error) => void;
  mocks.push.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
  render(<DashboardProvider><Probe form /></DashboardProvider>);
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
  fireEvent.change(screen.getByLabelText("Amount in USD"), { target: { value: "7" } });
  // SearchableSelect is replaced only for the test; the real Entry submit runs.
  const categorySelect = screen.getAllByRole("combobox").find((node) => node.textContent?.includes("Food"))!;
  fireEvent.change(categorySelect, { target: { value: "c" } });
  fireEvent.change(screen.getByLabelText("Select account…"), { target: { value: "a" } });
  fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
  const id = mocks.push.mock.calls[0][1].transactions[0].id;
  expect(id).toMatch(/^tx-/);
  expect(closed).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(closed).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { reject(new Error("Simulated write failure")); });
  expect(screen.getByRole("alert").textContent).toContain("Simulated write failure");
  expect(closed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
  await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  expect(mocks.push.mock.calls[1][1].transactions[0].id).toBe(id);
  expect(dashboard.transactions).toHaveLength(1);
  expect(dashboard.accounts[0].currentBalance).toBe(93);
});

it("successful Save survives provider unmount/remount using cloud only", async () => {
  const mounted = render(<DashboardProvider><Probe /></DashboardProvider>);
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
  await act(async () => { await dashboard.saveEntry({ id: "tx-durable", date: "2026-09-15", accountId: "a", categoryId: "c", type: "expense", amount: 2, description: "Durable entry", status: "cleared" }); });
  const saved = { ...mocks.push.mock.calls[0][1], cloudRows: {} };
  mounted.unmount(); localStorage.clear(); mocks.pull.mockResolvedValue(saved);
  render(<DashboardProvider><Probe /></DashboardProvider>);
  await waitFor(() => expect(screen.getByTestId("entries").textContent).toContain("Durable entry"));
  expect(mocks.push).toHaveBeenCalledTimes(1);
});

it("failed pending writes prevent sign-out, tenant switching and selector navigation", async () => {
  mocks.businesses.mockResolvedValue([
    { id: "business-a", name: "A", role: "owner", currency: "USD" },
    { id: "business-b", name: "B", role: "owner", currency: "USD" },
  ]);
  localStorage.setItem("budgeting-dashboard-v2-active-business", "business-a");
  render(<DashboardProvider><Probe /><CloudAccountCard /></DashboardProvider>);
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("synced"));
  mocks.push.mockRejectedValue(new Error("Write rejected"));
  await act(async () => {
    await expect(dashboard.saveEntry({ id: "tx-failure", date: "2026-09-15", accountId: "a", categoryId: "c", type: "expense", amount: 1, description: "Pending", status: "cleared" })).rejects.toThrow("Write rejected");
  });
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Write rejected"));
  expect(mocks.signOut).not.toHaveBeenCalled();
  const beforeSwitch = mocks.push.mock.calls.length;
  await act(async () => { fireEvent.change(screen.getByLabelText("Active business"), { target: { value: "business-b" } }); });
  expect(mocks.push.mock.calls.length).toBeGreaterThan(beforeSwitch);
  expect(localStorage.getItem("budgeting-dashboard-v2-active-business")).toBe("business-a");
  const beforeSelector = mocks.push.mock.calls.length;
  await act(async () => { fireEvent.click(screen.getByRole("link", { name: "Open workspace selector" })); });
  expect(mocks.push.mock.calls.length).toBeGreaterThan(beforeSelector);
  expect(dashboard.activeBusiness?.id).toBe("business-a");
});
