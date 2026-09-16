"use client";

import React, { createContext, useContext, useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  Account,
  Transaction,
  Category,
  Budget,
  Goal,
  PlannedTransaction,
  PeriodConfig,
  DashboardKPI,
  MonthlyBarRow,
  DonutRow,
  HeaderChartRow,
  OutflowRow,
  SpendingRow,
  ProgressRow,
  TodoRow,
  Activity,
  ActivityStatus,
  NewEntity,
  Notification,
  DashboardFilter,
} from "@/data/model/types";
import { todayISO, addDaysISO, getWeekRange } from "@/lib/dates";
import {
  accounts as seedAccounts,
  transactions as seedTransactions,
  categories as seedCategories,
  budgets as seedBudgets,
  goals as seedGoals,
  plannedTransactions as seedPlanned,
  periods as seedPeriods,
  initialTodos,
} from "@/data/seed";
import { calendarYearPeriod, yearsWithData, DEFAULT_YEAR } from "@/lib/period";
import {
  calculateKPIs,
  calculateMonthlyIncomeOutflow,
  calculateIncomeSplit,
  calculateOutflowTypes,
  calculateCumulativeGrowth,
  calculateNetWorthGrowth,
  calculateIncomeStreamStack,
  calculateTopOutflows,
  calculateTopSpendings,
  calculateProgress,
  calculateSavingsGoal,
  isRealized,
} from "@/lib/calculations";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import { addMonths } from "@/data/store";
import { DEFAULT_CURRENCY, CURRENCIES, setActiveCurrency, type CurrencyCode } from "@/lib/currency";
import { convertAmount, getExchangeRate, type FxRate, type FxStatus } from "@/lib/exchangeRates";
import {
  fetchBusinessesForUser,
  pullBusinessState,
  getActiveBusinessId,
  setActiveBusinessId,
  getCloudOwnerTag,
  setCloudOwnerTag,
  clearTenantLocalData,
  type BusinessInfo,
  type CloudSyncState,
  type CloudState,
} from "@/lib/cloudSync";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { usePathname } from "next/navigation";
import { CloudSaveQueue } from "./cloudSaveQueue";
import { checkPlatformAdmin, clearAdminViewing, getAdminViewing } from "@/lib/platformAdmin";

interface DashboardState {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  goals: Goal[];
  plannedTransactions: PlannedTransaction[];
  todos: TodoRow[];
  /** Active display currency code (wallet/display currency). */
  currency: CurrencyCode;
  /** Currency the stored/legacy dataset is denominated in (USD). */
  baseCurrency: CurrencyCode;
  /** Selected calendar year (e.g. 2026 → Jan 1 – Dec 31). */
  selectedYear: number;
  /** Calendar years that contain real data, most recent first. */
  availableYears: number[];
  activities: Activity[];
  /** Currently selected day for drill-down (YYYY-MM-DD), or null. */
  selectedDay: string | null;
  notifications: Notification[];
  /** Active search/filter state. */
  dashboardFilter: DashboardFilter;
  selectedPeriodId: string;
  periods: PeriodConfig[];
}

interface DashboardContextValue extends DashboardState {
  selectedPeriod: PeriodConfig | undefined;
  kpis: DashboardKPI[];
  monthlyIncomeOutflow: MonthlyBarRow[];
  incomeSplit: DonutRow[];
  outflowTypes: DonutRow[];
  cumulativeGrowth: HeaderChartRow[];
  netWorthGrowth: HeaderChartRow[];
  incomeStreamStack: Record<string, Record<string, number>>;
  topOutflows: OutflowRow[];
  topSpendings: SpendingRow[];
  progress: ProgressRow[];
  savingsGoal: DonutRow[];
  setSelectedPeriodId: (id: string) => void;
  /** Select a calendar year that contains real data. */
  setSelectedYear: (year: number) => void;
  updateGoal: (id: string, patch: Partial<NewEntity<Goal>>) => Promise<void>;
  updateAccountBalance: (id: string, balance: number) => Promise<void>;
  addTransaction: (tx: Omit<Transaction, "id">) => Promise<void>;

    addActivity: (data: Omit<Activity, "id">) => Promise<void>;
  updateActivity: (id: string, patch: Partial<Omit<Activity, "id">>) => Promise<void>;
  updateActivityStatus: (id: string, status: ActivityStatus) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;

  // ---- notifications ----
  // Phase 6: the mutator actions (add/dismiss/mark-read/clear) and the
  // derived alert feed were confirmed dead — zero consumers anywhere in
  // the app (this feature has no reachable UI; see the Phase 5 report).
  // Removed rather than left half-wired, per the Phase 6 dead-code
  // instructions; `notifications` itself stays exposed since it is real,
  // Supabase-synced business state (untouched here).
  notifications: Notification[];

  // ---- day drill-down ----
  selectedDay: string | null;
  setSelectedDay: (day: string | null) => void;
  dayTransactions: Transaction[];
  dayActivities: Activity[];
  todayISO: string;
  todayIncome: number;
  todayOutflow: number;
    todayNet: number;

  // ---- extra derived data ----
  activitiesForWeek: Activity[];
  budgetSummary: { totalBudgeted: number; totalActual: number; percentage: number; byMonth: Map<string, { budgeted: number; actual: number }> };
  upcomingRecurring: PlannedTransaction[];

  // ---- search & filtering ----
    dashboardFilter: DashboardFilter;
  setDashboardFilter: (patch: Partial<DashboardFilter>) => void;
  clearDashboardFilter: () => void;
  /** Change the active display currency (persisted + FX warmed). */
  setCurrency: (code: CurrencyCode) => void;
  filteredTransactions: Transaction[];

  // ---- display-currency view (RAW records stay untouched) ----
  /**
   * Transactions with `amount` converted to the display currency via the
   * centralized FX layer. Each row still carries its ORIGINAL `currency`
   * and original value semantics for editing/recovery.
   */
  displayTransactions: Transaction[];
  /** Accounts with balances converted to the display currency. */
  displayAccounts: Account[];
  /** Goals with target/current amounts converted to the display currency. */
  displayGoals: Goal[];
  /** Planned transactions with amounts converted to the display currency. */
  displayPlannedTransactions: PlannedTransaction[];
  /** FX layer status for the Profile currency card (loading/ready/stale/error). */
  fxState: FxStatus;
  /**
   * Convert an amount from its stored currency into the display currency
   * using the centralized best-known rate. Falls back to the raw value
   * when a rate is not yet available (status surfaces the gap).
   */
  convertAmount: (value: number, from: string, to?: string) => number;

  // ---- multi-tenant cloud session (Supabase) ----
  /** Business currently driving the session. Null = local-only (no
   *  Supabase configured, or nobody signed in). */
  activeBusiness: BusinessInfo | null;
  /** Cloud sync status for the active business. */
  cloudSyncState: CloudSyncState;

  // ---- data-entry CRUD ----
  saveEntry: (tx: Transaction) => Promise<void>;
  flushCloudChanges: () => Promise<void>;
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, "id">>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  /**
   * Bulk-replace whole collections (demo data load / restore). Only the
   * provided arrays are replaced; everything else stays untouched. Used
   * only by the cloud-hydration bootstrap itself — not a user-facing
   * mutation, so it stays outside the durability contract (there's nothing
   * to push: this data just came FROM the cloud).
   */
  replaceAllData: (data: {
    accounts?: Account[];
    transactions?: Transaction[];
    categories?: Category[];
    budgets?: Budget[];
    goals?: Goal[];
    plannedTransactions?: PlannedTransaction[];
    activities?: Activity[];
  }) => void;
  addAccount: (data: Omit<Account, "id" | "currentBalance">) => Promise<string>;
  updateAccount: (id: string, patch: Partial<NewEntity<Account>>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  addCategory: (data: NewEntity<Category>) => Promise<string>;
  updateCategory: (id: string, patch: Partial<NewEntity<Category>>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addBudget: (data: NewEntity<Budget>) => Promise<void>;
  updateBudget: (id: string, patch: Partial<NewEntity<Budget>>) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  addGoal: (data: NewEntity<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
    updatePlanned: (id: string, patch: Partial<NewEntity<PlannedTransaction>>) => Promise<void>;
  addPlanned: (data: NewEntity<PlannedTransaction>) => Promise<void>;
  deletePlanned: (id: string) => Promise<void>;

  // ---- payment workflow ----
  /** Pay a planned transaction: creates an actual Transaction, marks it
   *  completed, and seeds the next occurrence for recurring items — all as
   *  one atomic commit. Idempotent — resolves false if already paid or a
   *  transaction exists. Callers MUST await this before treating the
   *  payment as durable (Phase 3 fix for the previous fire-and-forget,
   *  silently-losable version).
   */
  payPlannedTransaction: (id: string) => Promise<boolean>;
  /** Cancel a pending planned transaction without creating a transaction.
   *  Callers must await this before treating it as durable. */
  cancelPlannedTransaction: (id: string) => Promise<boolean>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboardData(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardData must be used within DashboardProvider");
  return ctx;
}

const nextId = (prefix: string) => {
  return `${prefix}-${crypto.randomUUID()}`;
};

/**
 * Phase 6 — DashboardProvider/context rerender fix.
 *
 * `actions` (the ~35 mutator functions the provider exposes — addAccount,
 * updateBudget, payPlannedTransaction, etc.) is rebuilt from scratch every
 * render, same as before: cheap, and each closure still always sees the
 * current render's state/props. The problem this solves is downstream —
 * those fresh closures used to be spread directly into the big context
 * `value` object literal every render, so `value`'s reference changed on
 * literally every render of DashboardProvider (even ones triggered only
 * by a parent re-rendering, e.g. a route change via usePathname, with
 * zero actual dashboard data changed) — and every one of the ~20+
 * components calling useDashboardData() re-rendered in lockstep with it,
 * because React context has no per-field granularity: any new `value`
 * reference notifies every consumer, regardless of which fields it reads.
 *
 * `useStableActions` returns an object with the SAME keys/call signatures
 * as `actions`, but whose top-level reference — and every individual
 * function's reference — never changes for the life of the component.
 * Each stable wrapper forwards to the CURRENT render's real implementation
 * via a ref, so behavior is byte-for-byte identical to calling the real
 * function directly (no staleness risk: the ref is updated every render,
 * before any wrapper could be called). This lets the big `value` object
 * be wrapped in `useMemo` with ONE stable dependency (the whole actions
 * bundle) instead of ~35 volatile per-render closures, so `value` only
 * gets a new reference when actual state/derived data changes — not on
 * every render for any reason.
 *
 * Ref writes/reads happen only inside the layout effect and inside the
 * wrapper closures themselves (called later, from event handlers) — never
 * directly in the render body — per the react-hooks/refs rule.
 */
function useStableActions<T extends Record<string, unknown>>(actions: T): T {
  const latest = useRef(actions);
  useLayoutEffect(() => {
    latest.current = actions;
  });
  const [stable] = useState<T>(() => {
    const obj: Record<string, unknown> = {};
    for (const key of Object.keys(actions)) {
      obj[key] = (...args: unknown[]) =>
        (latest.current as Record<string, (...a: unknown[]) => unknown>)[key](...args);
    }
    return obj as T;
  });
  return stable;
}

const accountDelta = (transactions: Transaction[], accountId: string) =>
  transactions.reduce((sum, t) => {
    // Pending transactions are "not counted yet" (isRealized) — account
    // balances must agree with every other realized-only total (Phase 2 fix).
    if (!isRealized(t)) return sum;
    let delta = 0;
    if (t.accountId === accountId) {
      if (t.type === "income") delta += t.amount;
      else if (t.type === "expense" || t.type === "transfer") delta -= t.amount;
    }
    if (t.toAccountId === accountId) delta += t.amount;
    return sum + delta;
  }, 0);

const recomputeBalances = (accounts: Account[], transactions: Transaction[]) =>
  accounts.map((a) => ({
    ...a,
    currentBalance: a.openingBalance + accountDelta(transactions, a.id),
  }));

/**
 * Recompute every budget's actualAmount from the current transaction list.
 * actualAmount = sum of all transaction amounts for the category in the budget's month.
 * This ensures budget actuals always reflect the source-of-truth transaction data.
 */
const recomputeBudgetActuals = (budgets: Budget[], transactions: Transaction[]): Budget[] =>
  budgets.map((b) => ({
    ...b,
    // Every type (including transfers into a debt/savings category) still
    // counts toward budget usage — that divergence from Outflow Types/Top
    // Spendings (which are expense-only, see calculations.ts) is deliberate:
    // budget "spend against a category" and aggregate "business outflow"
    // are different concepts. Pending transactions are excluded either way
    // (Phase 2 fix) — "not counted yet" applies uniformly.
    actualAmount: transactions
      .filter((t) => t.categoryId === b.categoryId && t.date.startsWith(b.month) && isRealized(t))
      .reduce((sum: number, t: Transaction) => sum + t.amount, 0),
  }));

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  // Cloud mode: Supabase configured. In a business workspace the ONLY data
  // source is that business's cloud state — the single-user demo (seed)
  // dataset must never render, even for a frame. The seed dataset remains
  // the starter only for the unconfigured local-only demo mode.
  const cloudEnabled = isSupabaseConfigured();
  const pathname = usePathname();
  const workspaceSurface = pathname !== "/login" && pathname !== "/workspaces" && !pathname.startsWith("/admin");

  // Deterministic SSR: the first render (server AND client) uses the
  // starter defaults; persisted state is loaded once after mount. This
  // keeps the server HTML identical to the first client render (no
  // hydration drift), while saved user data still wins after hydration.
  const [hydrated, setHydrated] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>(cloudEnabled ? [] : seedAccounts);
  const [transactions, setTransactions] = useState<Transaction[]>(cloudEnabled ? [] : seedTransactions);
  const [categories, setCategories] = useState<Category[]>(cloudEnabled ? [] : seedCategories);
  const [budgets, setBudgets] = useState<Budget[]>(cloudEnabled ? [] : seedBudgets);
  const [goals, setGoals] = useState<Goal[]>(cloudEnabled ? [] : seedGoals);
  const [plannedTransactions, setPlannedTransactions] = useState<PlannedTransaction[]>(
    cloudEnabled ? [] : seedPlanned
  );
  const [todos, setTodos] = useState<TodoRow[]>(cloudEnabled ? [] : initialTodos);
  const [selectedYear, setSelectedYear] = useState<number>(DEFAULT_YEAR);
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dashboardFilter, setDashboardFilterValue] = useState<DashboardFilter>({});

  // ---- multi-tenant cloud session (Supabase) ----
  const [activeBusiness, setActiveBusiness] = useState<BusinessInfo | null>(null);
  const [cloudSyncState, setCloudSyncState] = useState<CloudSyncState>("idle");
  const [cloudReady, setCloudReady] = useState(false);
  const saveQueueRef = useRef<CloudSaveQueue | null>(null);
  const latestStateRef = useRef<CloudState | null>(null);

  // Keep the centralized formatter layer in sync with the selection so every
  // legacy formatMoney/formatMoneyFull call site is currency-aware.
  setActiveCurrency(currency);

  // ------------------------------------------------------------------
  // Centralized FX — REAL rates via ONE service (app/lib/exchangeRates).
  // Conversion is computed here and handed to every consumer as display
  // views; RAW records are never mutated, so switching currencies back
  // and forth never re-converts already-converted values.
  // ------------------------------------------------------------------
  const baseCurrency: CurrencyCode = DEFAULT_CURRENCY;
  const [fxState, setFxState] = useState<FxStatus>({
    status: "idle",
    from: DEFAULT_CURRENCY,
    to: currency,
    missing: [],
  });
  // Bumped each time a rate warms so derived display data recomputes.
  const [fxTick, setFxTick] = useState(0);
  const prevCurrencyRef = useRef<CurrencyCode>(currency);
  useEffect(() => {
    prevCurrencyRef.current = currency;
  }, [currency]);

  const acctCurrency = (accountId?: string): string =>
    accounts.find((a) => a.id === accountId)?.currency ?? DEFAULT_CURRENCY;
  const txBaseCurrency = (t: Transaction): string =>
    t.currency ?? acctCurrency(t.accountId);
  const goalBaseCurrency = (g: Goal): string => g.currency ?? DEFAULT_CURRENCY;
  const plannedBaseCurrency = (p: PlannedTransaction): string =>
    p.currency ?? acctCurrency(p.accountId);

  /** Best-known sync conversion to the display currency (raw fallback). */
  const toDisplay = (value: number, from: string): number =>
    convertAmount(value, from, currency) ?? value;

  /** Distinct stored/base currencies that need a rate toward `currency`. */
  const fxBaseCurrencies = useMemo(() => {
    const set = new Set<string>([DEFAULT_CURRENCY]);
    for (const t of transactions) set.add(txBaseCurrency(t));
    for (const g of goals) set.add(goalBaseCurrency(g));
    for (const p of plannedTransactions) set.add(plannedBaseCurrency(p));
    return [...set];
    // txBaseCurrency/plannedBaseCurrency read `accounts` (via acctCurrency);
    // `accounts` is listed explicitly so an account-currency edit alone still
    // recomputes this set (Phase 2 fix). The helper functions themselves stay
    // out of the array — they're plain in-render closures, not memoized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, goals, plannedTransactions, accounts]);

  /** Refresh/warm the cached rate(s) for `target`. One request per base,
   *  then all sync convertAmount calls reuse the stored snapshot. */
  const warmFxRates = async (target: string) => {
    const from =
      prevCurrencyRef.current === target && fxState.status === "idle"
        ? baseCurrency
        : prevCurrencyRef.current;
    const bases = fxBaseCurrencies;
    setFxState({ status: "loading", from, to: target, missing: [] });
    const results = await Promise.all(
      bases.map(async (base): Promise<{ base: string; rate: FxRate | null }> => {
        try {
          return { base, rate: await getExchangeRate(base, target) };
        } catch {
          return { base, rate: null };
        }
      })
    );
    const found = results.filter((r) => r.rate !== null);
    const missing = results.filter((r) => r.rate === null).map((r) => r.base);
    const stale = found.some((r) => r.rate!.stale === true);
    const updatedAt = found.reduce((max, r) => Math.max(max, r.rate!.timestamp), 0);
    setFxState({
      status:
        missing.length === 0
          ? stale
            ? "stale"
            : "ready"
          : found.length === 0
            ? "error"
            : "partial",
      from,
      to: target,
      updatedAt: updatedAt || undefined,
      missing,
    });
    setFxTick((t) => t + 1);
  };

  /** Persisted + FX-aware currency switch shown to the UI. */
  const changeCurrency = (next: CurrencyCode) => {
    if (next === currency) return;
    setCurrency(next);
    void warmFxRates(next);
  };

  // Warm rates for the persisted display currency once after hydration.
  useEffect(() => {
    if (!hydrated) return;
    void warmFxRates(currency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // --- calendar-year period derivation (existing calculations keep working) ---
  const availableYears = useMemo(() => yearsWithData(transactions), [transactions]);
  // Free navigation: any plausible year may be selected (empty years simply
  // show honest empty states); only guard against corrupted stored values.
  const effectiveYear =
    selectedYear >= 1970 && selectedYear <= 2100
      ? selectedYear
      : (availableYears[0] ?? DEFAULT_YEAR);
  const selectedPeriod = useMemo(() => calendarYearPeriod(effectiveYear), [effectiveYear]);
  const periods = useMemo(() => availableYears.map((y) => calendarYearPeriod(y)), [availableYears]);
  const selectedPeriodId = String(effectiveYear);

  // Back-compat: the whole app used to select "periods"; now the period is
  // implied by the selected year. Keep a setter so old call sites still work.
  const setSelectedPeriodId = (id: string) => setSelectedYear(Number(id));

  // Load persisted state once after mount. Declared BEFORE the persistence
  // effects below so stored data is read before anything could be rewritten.
  // setState-in-effect is intentional here: reading localStorage during render
  // would make server and first-client renders diverge (hydration mismatch).
  // In cloud mode the fallback is EMPTY (never the demo seed): a business
  // workspace with a cleared/empty tenant cache must show empty states, not
  // another dataset.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (cloudEnabled) {
      setHydrated(true);
      return;
    }
    setAccounts(loadFromStorage("accounts", seedAccounts));
    setTransactions(loadFromStorage("transactions", cloudEnabled ? [] : seedTransactions));
    setCategories(loadFromStorage("categories", cloudEnabled ? [] : seedCategories));
    setBudgets(loadFromStorage("budgets", cloudEnabled ? [] : seedBudgets));
    setGoals(loadFromStorage("goals", cloudEnabled ? [] : seedGoals));
    setPlannedTransactions(loadFromStorage("planned", cloudEnabled ? [] : seedPlanned));
    setTodos(loadFromStorage("todos", cloudEnabled ? [] : initialTodos));
        setSelectedYear(loadFromStorage("year", DEFAULT_YEAR));
    setCurrency(loadFromStorage("currency", DEFAULT_CURRENCY));
    setActivities(loadFromStorage("activities", []));
    setSelectedDay(loadFromStorage("selectedDay", todayISO()));
    setNotifications(loadFromStorage("notifications", []));
    setDashboardFilterValue(loadFromStorage("dashboardFilter", {}));
    setHydrated(true);
    // cloudEnabled is a stable env-derived constant for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Phase 6: these mirror local-only (demo) state into localStorage so the
  // hydration effect above can read it back on the next visit. In CLOUD
  // mode that read never happens — the hydration effect returns before any
  // loadFromStorage call whenever `cloudEnabled` is true — so the previous
  // `!cloudEnabled || cloudReady` guard was writing every collection
  // (transactions/accounts/etc. included) to localStorage, unread, on
  // every single mutation of a real cloud business. Scoping the guard to
  // local-only mode removes that write entirely with no observable change
  // (nothing ever consumed it in cloud mode).
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("accounts", accounts); }, [hydrated, cloudEnabled, accounts]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("transactions", transactions); }, [hydrated, cloudEnabled, transactions]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("categories", categories); }, [hydrated, cloudEnabled, categories]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("budgets", budgets); }, [hydrated, cloudEnabled, budgets]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("goals", goals); }, [hydrated, cloudEnabled, goals]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("planned", plannedTransactions); }, [hydrated, cloudEnabled, plannedTransactions]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("todos", todos); }, [hydrated, cloudEnabled, todos]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("year", effectiveYear); }, [hydrated, cloudEnabled, effectiveYear]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("currency", currency); }, [hydrated, cloudEnabled, currency]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("activities", activities); }, [hydrated, cloudEnabled, activities]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("selectedDay", selectedDay); }, [hydrated, cloudEnabled, selectedDay]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("notifications", notifications); }, [hydrated, cloudEnabled, notifications]);
  useEffect(() => { if (hydrated && !cloudEnabled) saveToStorage("dashboardFilter", dashboardFilter); }, [hydrated, cloudEnabled, dashboardFilter]);

  // ---- display-currency views (RAW records stay untouched & recoverable) ----
  const displayTransactions = useMemo(
    () =>
      transactions.map((t) => ({
        ...t,
        amount: toDisplay(t.amount, txBaseCurrency(t)),
        currency: t.currency ?? txBaseCurrency(t),
      })),
    // `accounts` is required: txBaseCurrency falls back to the transaction's
    // account currency, so an account-currency edit alone must still
    // recompute this view (Phase 2 fix — was previously stale until some
    // unrelated dependency happened to change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, currency, fxTick, accounts]
  );

  const displayAccounts = useMemo(
    () =>
      accounts.map((a) => ({
        ...a,
        currentBalance: toDisplay(a.currentBalance, a.currency ?? DEFAULT_CURRENCY),
        openingBalance: toDisplay(a.openingBalance, a.currency ?? DEFAULT_CURRENCY),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, currency, fxTick]
  );

  const displayGoals = useMemo(
    () =>
      goals.map((g) => ({
        ...g,
        targetAmount: toDisplay(g.targetAmount, goalBaseCurrency(g)),
        currentAmount: toDisplay(g.currentAmount, goalBaseCurrency(g)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goals, currency, fxTick]
  );

  const displayPlannedTransactions = useMemo(
    () =>
      plannedTransactions.map((p) => ({
        ...p,
        amount: toDisplay(p.amount, plannedBaseCurrency(p)),
        currency: p.currency ?? plannedBaseCurrency(p),
      })),
    // Same `accounts` requirement as displayTransactions above (Phase 2 fix).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plannedTransactions, currency, fxTick, accounts]
  );

  // Phase 6: every one of the 9 calculations below independently
  // re-filtered the FULL (all-years) displayTransactions array down to the
  // selected period, each redoing the same date-range+isRealized pass —
  // measurably wasteful for a business with multi-year history but only
  // one year selected. Pre-filtering ONCE here and feeding the smaller,
  // already-period-scoped array into every calculation is behaviorally
  // identical: every one of these functions already ANDs `isRealized(t)`
  // into its own filter and scopes to the exact same date range (directly,
  // or via per-month `startsWith` against `period.months`, which covers
  // the identical set of dates for a calendar-year period) — so their own
  // internal filtering becomes a redundant-but-harmless no-op on an
  // already-narrowed array, not a behavior change. See
  // tests/dashboard-calculation-memo.test.tsx for the regression proof.
  const periodTransactions = useMemo(() => {
    const p = selectedPeriod || seedPeriods[0];
    return displayTransactions.filter(
      (t) => t.date >= p.startDate && t.date <= p.endDate && isRealized(t)
    );
  }, [displayTransactions, selectedPeriod]);

  // Every existing calculation now consumes display-currency values so all
  // KPIs, charts, monthlies, growth and goals agree on ONE conversion layer.
  const kpis = useMemo(() => calculateKPIs(periodTransactions, displayAccounts, displayGoals, selectedPeriod || seedPeriods[0]), [periodTransactions, displayAccounts, displayGoals, selectedPeriod]);
  const monthlyIncomeOutflow = useMemo(() => calculateMonthlyIncomeOutflow(periodTransactions, selectedPeriod || seedPeriods[0]), [periodTransactions, selectedPeriod]);
  const incomeSplit = useMemo(() => calculateIncomeSplit(periodTransactions, categories, selectedPeriod || seedPeriods[0]), [periodTransactions, categories, selectedPeriod]);
  const outflowTypes = useMemo(() => calculateOutflowTypes(periodTransactions, categories, selectedPeriod || seedPeriods[0]), [periodTransactions, categories, selectedPeriod]);
  const cumulativeGrowth = useMemo(() => calculateCumulativeGrowth(periodTransactions, selectedPeriod || seedPeriods[0]), [periodTransactions, selectedPeriod]);
  const netWorthGrowth = useMemo(
    () => calculateNetWorthGrowth(displayAccounts, periodTransactions, selectedPeriod || seedPeriods[0]),
    [displayAccounts, periodTransactions, selectedPeriod]
  );
  const incomeStreamStack = useMemo(() => calculateIncomeStreamStack(periodTransactions, categories, selectedPeriod || seedPeriods[0]), [periodTransactions, categories, selectedPeriod]);
  const topOutflows = useMemo(() => calculateTopOutflows(periodTransactions, selectedPeriod || seedPeriods[0]), [periodTransactions, selectedPeriod]);
  const topSpendings = useMemo(() => calculateTopSpendings(periodTransactions, categories, selectedPeriod || seedPeriods[0]), [periodTransactions, categories, selectedPeriod]);
  const progress = useMemo(() => calculateProgress(displayGoals), [displayGoals]);
  const savingsGoal = useMemo(() => calculateSavingsGoal(displayAccounts, displayGoals), [displayAccounts, displayGoals]);

  // ---- New Feature: derived data for Today, Day view, Search, Budget, Goals ----

    /** Transactions filtered by the dashboardFilter (display-currency view) */
  const filteredTransactions = useMemo(() => {
    return displayTransactions.filter((tx) => {
      // Default to the selected year's range if no explicit date range is set
      const yearStr = String(effectiveYear);
      const dateFrom = dashboardFilter.dateFrom ?? `${yearStr}-01-01`;
      const dateTo = dashboardFilter.dateTo ?? `${yearStr}-12-31`;

      if (tx.date < dateFrom || tx.date > dateTo) return false;

      // Type filter
      if (dashboardFilter.type && dashboardFilter.type !== "all" && tx.type !== dashboardFilter.type) return false;

      // Category filter
      if (dashboardFilter.categoryId && tx.categoryId !== dashboardFilter.categoryId) return false;

      // Search filter
      if (dashboardFilter.search) {
        const query = dashboardFilter.search.toLowerCase();
        if (!tx.description.toLowerCase().includes(query)) return false;
      }

      // Status filter
      if (dashboardFilter.status && dashboardFilter.status !== "all" && tx.status !== dashboardFilter.status) return false;

      // Amount filters
      if (dashboardFilter.minAmount !== undefined && tx.amount < dashboardFilter.minAmount) return false;
      if (dashboardFilter.maxAmount !== undefined && tx.amount > dashboardFilter.maxAmount) return false;

      return true;
    });
  }, [displayTransactions, dashboardFilter, effectiveYear]);

  /** Activities for the current week */
  const activitiesForWeek = useMemo(() => {
    const { start, end } = getWeekRange(todayISO());
    return activities.filter((a) => a.date >= start && a.date <= end);
  }, [activities]);

    /** Budget summary for the selected year — aggregates all budgets */
  const budgetSummary = useMemo(() => {
    const yearBudgets = budgets;
    let totalBudgeted = 0;
    let totalActual = 0;
    const byMonth = new Map<string, { budgeted: number; actual: number }>();

    for (const b of yearBudgets) {
      totalBudgeted += b.plannedAmount;
      totalActual += b.actualAmount ?? 0;
      const mk = b.month;
      const existing = byMonth.get(mk) ?? { budgeted: 0, actual: 0 };
      existing.budgeted += b.plannedAmount;
      existing.actual += b.actualAmount ?? 0;
      byMonth.set(mk, existing);
    }

    return {
      totalBudgeted,
      totalActual,
      percentage: totalBudgeted > 0 ? Math.round((totalActual / totalBudgeted) * 100) : 0,
      byMonth,
    };
  }, [budgets]);

  /** Upcoming recurring/planned transactions (next 30 days) */
    const upcomingRecurring = useMemo(() => {
    const now = todayISO();
    const in30 = addDaysISO(now, 30);
    return [...plannedTransactions]
      .filter((p) => p.status === "pending" && p.date >= now && p.date <= in30)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [plannedTransactions]);

    // ---- day drill-down derived data ----
  const effectiveDay = selectedDay ?? todayISO();
  const dayTransactions = useMemo(
    () => displayTransactions.filter((tx) => tx.date === effectiveDay),
    [displayTransactions, effectiveDay]
  );
  const dayActivities = useMemo(
    () => activities.filter((a) => a.date === effectiveDay),
    [activities, effectiveDay]
  );
  const todayISOValue = todayISO();
  const todayTxs = useMemo(
    () => displayTransactions.filter((tx) => tx.date === todayISOValue),
    [displayTransactions, todayISOValue]
  );
  // Phase 2 fixes, matching calculations.ts's rule exactly: pending
  // transactions are excluded (isRealized), and a transfer between the
  // user's own accounts is never counted as outflow at this aggregate
  // level (it only moves money between individual account balances).
  const todayIncome = useMemo(
    () => todayTxs.filter((tx) => tx.type === "income" && isRealized(tx)).reduce((sum, tx) => sum + tx.amount, 0),
    [todayTxs]
  );
  const todayOutflow = useMemo(
    () => todayTxs.filter((tx) => tx.type === "expense" && isRealized(tx)).reduce((sum, tx) => sum + tx.amount, 0),
    [todayTxs]
  );
  const todayNet = todayIncome - todayOutflow;

  const setDashboardFilter = (patch: Partial<DashboardFilter>) => {
    setDashboardFilterValue((prev) => ({ ...prev, ...patch }));
  };

  const clearDashboardFilter = () => {
    setDashboardFilterValue({});
  };

  /**
   * Phase 3 durability contract — the single commit path every mutation in
   * this provider goes through (saveEntry included, see below).
   *
   * `mutate` receives the latest known state and returns the next state.
   * That next state is applied to React state immediately (optimistic —
   * the UI reflects it without waiting), then handed to the save queue and
   * AWAITED through to cloud acknowledgement. The returned promise:
   *   - resolves only once Supabase has acknowledged the write — callers
   *     must not treat their own "success" (closing a dialog, clearing an
   *     input, toggling a checkbox as done) as true before this resolves;
   *   - rejects if the write is refused. The optimistic local state is
   *     deliberately NOT rolled back on rejection — it stays applied and
   *     pending, matching the existing queue's retry-on-next-flush design
   *     (dirty state means unsaved, not "gone"; see CloudSaveQueue). The
   *     caller decides what a failure means for its own UI (keep a form
   *     open, show an inline error, etc.) — see EntryForm for the
   *     reference pattern this mirrors.
   *
   * In local-only mode (no Supabase configured) `queue` is always null and
   * the guard below never fires, so this reduces to "apply and resolve" —
   * identical to the previous synchronous behavior.
   */
  const commitMutation = async (mutate: (state: CloudState) => CloudState): Promise<CloudState> => {
    const queue = saveQueueRef.current;
    if (cloudEnabled && (!cloudReady || !queue || getAdminViewing())) {
      throw new Error("Workspace is not ready for saving. Reload and try again.");
    }
    const current = latestStateRef.current;
    if (!current) throw new Error("Workspace is still loading.");
    const next = mutate(current);
    latestStateRef.current = next;
    queue?.observe(next);
    setAccounts(next.accounts);
    setTransactions(next.transactions);
    setCategories(next.categories);
    setBudgets(next.budgets);
    setGoals(next.goals);
    setPlannedTransactions(next.plannedTransactions);
    setActivities(next.activities);
    setNotifications(next.notifications);
    setTodos(next.todos);
    await queue?.flush();
    return next;
  };

  // Phase 6: toggleTodo/addTodo removed — the only UI that called them
  // (Checklist.tsx's TodoList) was confirmed unmounted anywhere in the app
  // and deleted. `todos` state itself is untouched (still Supabase-synced).

  // ---- activities (day-to-day tracking) ----
  const addActivity = async (data: Omit<Activity, "id">) => {
    await commitMutation((state) => ({
      ...state,
      activities: [...state.activities, { id: nextId("activity"), ...data, status: data.status ?? "pending" }],
    }));
  };

  const updateActivity = async (id: string, patch: Partial<Omit<Activity, "id">>) => {
    await commitMutation((state) => ({
      ...state, activities: state.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  };

  const deleteActivity = async (id: string) => {
    await commitMutation((state) => ({
      ...state, activities: state.activities.filter((a) => a.id !== id),
    }));
  };

  const updateGoal = async (id: string, patch: Partial<NewEntity<Goal>>) => {
    await commitMutation((state) => ({
      ...state, goals: state.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  };

  // ---- data-entry CRUD ----

  /** Internal only (payPlannedTransaction). Entry-form saves go through
   *  saveEntry, which handles both create and edit in one commit. */
  const addTransaction = async (tx: Omit<Transaction, "id">) => {
    await commitMutation((state) => {
      const next = [...state.transactions, { ...tx, id: nextId("tx") }];
      return { ...state, transactions: next,
        accounts: recomputeBalances(state.accounts, next),
        budgets: recomputeBudgetActuals(state.budgets, next) };
    });
  };

  const updateTransaction = async (id: string, patch: Partial<Omit<Transaction, "id">>) => {
    await commitMutation((state) => {
      const next = state.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t));
      return { ...state, transactions: next,
        accounts: recomputeBalances(state.accounts, next),
        budgets: recomputeBudgetActuals(state.budgets, next) };
    });
  };

  const deleteTransaction = async (id: string) => {
    await commitMutation((state) => {
      const next = state.transactions.filter((t) => t.id !== id);
      return { ...state, transactions: next,
        accounts: recomputeBalances(state.accounts, next),
        budgets: recomputeBudgetActuals(state.budgets, next) };
    });
  };

  const replaceAllData = (data: Parameters<DashboardContextValue["replaceAllData"]>[0]) => {
    if (data.accounts) setAccounts(data.accounts);
    if (data.transactions) setTransactions(data.transactions);
    if (data.categories) setCategories(data.categories);
    if (data.budgets) setBudgets(data.budgets);
    if (data.goals) setGoals(data.goals);
    if (data.plannedTransactions) setPlannedTransactions(data.plannedTransactions);
    if (data.activities) setActivities(data.activities);
  };

  /** Restore the starter dataset after a tenant-cache wipe.
   *  In cloud mode the starter is EMPTY: a business workspace must show
   *  its own data only — never the single-user demo (seed) dataset, which
   *  would otherwise appear identical across every business. The seed
   *  dataset remains the starter for the unconfigured local-only demo. */
  const resetToStarterState = () => {
    if (isSupabaseConfigured()) {
      setAccounts([]);
      setTransactions([]);
      setCategories([]);
      setBudgets([]);
      setGoals([]);
      setPlannedTransactions([]);
      setTodos([]);
      setActivities([]);
      setNotifications([]);
      setSelectedYear(DEFAULT_YEAR);
      setCurrency(DEFAULT_CURRENCY);
      setSelectedDay(todayISO());
      setDashboardFilterValue({});
      return;
    }
    setAccounts(seedAccounts);
    setTransactions(seedTransactions);
    setCategories(seedCategories);
    setBudgets(seedBudgets);
    setGoals(seedGoals);
    setPlannedTransactions(seedPlanned);
    setTodos(initialTodos);
    setActivities([]);
    setNotifications([]);
    setSelectedYear(DEFAULT_YEAR);
    setCurrency(DEFAULT_CURRENCY);
    setSelectedDay(todayISO());
    setDashboardFilterValue({});
  };

  const addAccount = async (data: Omit<Account, "id" | "currentBalance">) => {
    const newId = nextId("a");
    await commitMutation((state) => ({
      ...state,
      accounts: [...state.accounts, { id: newId, ...data,
        currentBalance: data.openingBalance, active: data.active ?? true }],
    }));
    return newId;
  };

  const updateAccount = async (id: string, patch: Partial<NewEntity<Account>>) => {
    await commitMutation((state) => ({
      ...state, accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  };

  const deleteAccount = async (id: string) => {
    await commitMutation((state) => ({
      ...state, accounts: state.accounts.map((a) => (a.id === id ? { ...a, active: false } : a)),
    }));
  };

  const addCategory = async (data: NewEntity<Category>) => {
    const newId = nextId("c");
    await commitMutation((state) => ({
      ...state, categories: [...state.categories, { id: newId, ...data }],
    }));
    return newId;
  };

  const updateCategory = async (id: string, patch: Partial<NewEntity<Category>>) => {
    await commitMutation((state) => ({
      ...state, categories: state.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const deleteCategory = async (id: string) => {
    await commitMutation((state) => ({
      ...state, categories: state.categories.filter((c) => c.id !== id),
    }));
  };

  const addBudget = async (data: NewEntity<Budget>) => {
    // Recompute immediately: a budget created for a category that already
    // has spending this month must show that spend right away, not just
    // after the next unrelated transaction mutation happens to trigger a
    // recompute elsewhere.
    await commitMutation((state) => {
      const budgets = [...state.budgets, { id: nextId("b"), ...data }];
      return { ...state, budgets: recomputeBudgetActuals(budgets, state.transactions) };
    });
  };

  const updateBudget = async (id: string, patch: Partial<NewEntity<Budget>>) => {
    await commitMutation((state) => {
      const budgets = state.budgets.map((b) => (b.id === id ? { ...b, ...patch } : b));
      return { ...state, budgets: recomputeBudgetActuals(budgets, state.transactions) };
    });
  };

  const deleteBudget = async (id: string) => {
    await commitMutation((state) => ({
      ...state, budgets: state.budgets.filter((b) => b.id !== id),
    }));
  };

  const addGoal = async (data: NewEntity<Goal>) => {
    await commitMutation((state) => ({
      ...state, goals: [...state.goals, { id: nextId("g"), ...data, status: data.status ?? "active" }],
    }));
  };

  const deleteGoal = async (id: string) => {
    await commitMutation((state) => ({
      ...state, goals: state.goals.filter((g) => g.id !== id),
    }));
  };

  const addPlanned = async (data: NewEntity<PlannedTransaction>) => {
    await commitMutation((state) => ({
      ...state,
      plannedTransactions: [...state.plannedTransactions, { id: nextId("p"), ...data, status: data.status ?? "pending" }],
    }));
  };

  const updatePlanned = async (id: string, patch: Partial<NewEntity<PlannedTransaction>>) => {
    await commitMutation((state) => ({
      ...state, plannedTransactions: state.plannedTransactions.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  };

  const deletePlanned = async (id: string) => {
    await commitMutation((state) => ({
      ...state, plannedTransactions: state.plannedTransactions.filter((p) => p.id !== id),
    }));
  };

  /**
   * Payment workflow: pay a planned transaction.
   *
   * 1. Idempotency guard (ref) prevents double-processing from rapid clicks
   *    or stale closure reads — survives re-renders without depending on
   *    React state that is asynchronously updated. Reserved BEFORE the
   *    await so a second click during the in-flight commit is a no-op, and
   *    released again if the commit is rejected so the user can retry.
   * 2. Duplicate protection: checks whether a Transaction with plannedId === id
   *    already exists. If so, does not create another.
   * 3. Creates the actual Transaction (source of truth, status "cleared",
   *    plannedId link), marks the planned entry completed, and — for
   *    recurring items — seeds the next occurrence, ALL as one atomic
   *    commitMutation call. This was previously three separate local
   *    mutations (addTransaction, updatePlanned, addPlanned), each
   *    fire-and-forget; a failure between them could leave a paid bill
   *    with no transaction, or a transaction with no completed status.
   *    Phase 3 fix: one commit, one cloud round-trip, all-or-nothing.
   *
   * @returns true if payment was newly processed, false if it was a no-op.
   *   The caller MUST await this before treating the payment as durable.
   */
  const paidIdsRef = useRef<Set<string>>(new Set());

  const payPlannedTransaction = async (id: string): Promise<boolean> => {
    // Double-click / re-render idempotency: once paid, never process again
    if (paidIdsRef.current.has(id)) return false;

    const planned = plannedTransactions.find((p) => p.id === id);
    if (!planned) return false;
    if (planned.status === "completed") {
      // Already completed — ensure we have a matching transaction, then bail out
      const existing = transactions.find((t) => t.plannedId === id);
      if (existing) {
        paidIdsRef.current.add(id);
        return false;
      }
      // Edge: status was "completed" but no transaction exists — fall through
      // to create it so data stays consistent.
    }

    // Duplicate protection: no transaction should exist for this planned tx
    const existingTx = transactions.find((t) => t.plannedId === id);
    if (existingTx) {
      // Transaction exists but planned not completed — sync status, no new tx
      paidIdsRef.current.add(id);
      await updatePlanned(id, { status: "completed" });
      return false;
    }

    paidIdsRef.current.add(id);
    try {
      await commitMutation((state) => {
        const nextTransactions = [...state.transactions, {
          id: nextId("tx"),
          date: planned.date,
          accountId: planned.accountId,
          categoryId: planned.categoryId,
          description: planned.description,
          amount: planned.amount,
          type: planned.type,
          status: "cleared" as const,
          plannedId: id,
          toAccountId: planned.toAccountId,
          currency: planned.currency,
        }];
        // Seed the next occurrence for recurring items (keeps each
        // occurrence independently payable — paying August does not mark
        // September as paid).
        let nextPlanned = state.plannedTransactions.map((p) =>
          p.id === id ? { ...p, status: "completed" as const } : p);
        if (planned.recurrence === "monthly" || planned.recurrence === "yearly") {
          const monthsToAdd = planned.recurrence === "monthly" ? 1 : 12;
          nextPlanned = [...nextPlanned, {
            id: nextId("p"),
            date: addMonths(planned.date, monthsToAdd),
            accountId: planned.accountId,
            categoryId: planned.categoryId,
            description: planned.description,
            amount: planned.amount,
            type: planned.type,
            status: "pending" as const,
            recurrence: planned.recurrence,
            toAccountId: planned.toAccountId,
            currency: planned.currency,
          }];
        }
        return { ...state, transactions: nextTransactions, plannedTransactions: nextPlanned,
          accounts: recomputeBalances(state.accounts, nextTransactions),
          budgets: recomputeBudgetActuals(state.budgets, nextTransactions) };
      });
    } catch (error) {
      paidIdsRef.current.delete(id); // release the guard so a retry is possible
      throw error;
    }
    return true;
  };

  /**
   * Cancel a planned transaction without creating an actual transaction.
   * Does NOT affect account balances or budget actuals. The caller must
   * await this before treating the cancellation as durable.
   */
  const cancelPlannedTransaction = async (id: string): Promise<boolean> => {
    const planned = plannedTransactions.find((p) => p.id === id);
    if (!planned || planned.status !== "pending") return false;
    await updatePlanned(id, { status: "cancelled" });
    return true;
  };

  const updateAccountBalance = async (id: string, balance: number) => {
    await commitMutation((state) => ({
      ...state, accounts: state.accounts.map((a) => (a.id === id ? { ...a, currentBalance: balance } : a)),
    }));
  };

  // ---- activity status shorthand ----
  const updateActivityStatus = async (id: string, status: ActivityStatus) => {
    await commitMutation((state) => ({
      ...state, activities: state.activities.map((a) => (a.id === id ? { ...a, status } : a)),
    }));
  };

  // ---- notifications ----
  // Phase 6: addNotification/dismissNotification/markNotificationRead/
  // clearNotifications removed — confirmed zero consumers anywhere in the
  // app (notifications have no reachable UI; see the Phase 5 report).
  // markNotificationRead in particular wrote a `read` field the
  // Notification model doesn't have (flagged as dead/broken since Phase
  // 3) — removed rather than patched, per the Phase 6 instruction to
  // remove a confirmed-dead broken path instead of inventing a fix for
  // code nothing calls. `notifications` state itself is untouched (still
  // Supabase-synced; no table or CloudState field was removed).

  // Resolve auth and tenant, then read cloud state before enabling any writes.
  useEffect(() => {
    if (!hydrated || !cloudEnabled || !workspaceSurface) return;
    let cancelled = false;

    // Deliberate synchronous status flip: "syncing" must be visible the
    // instant the bootstrap starts, before the first await resolves. This
    // is external-system synchronization (Supabase), which React permits;
    // the lint rule cannot see the async boundary, so disable it here only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCloudSyncState("syncing");
    setCloudReady(false);
    (async () => {
      try {
        const client = getSupabaseBrowserClient();
        const auth = await client?.auth.getUser();
        if (!auth?.data?.user) {
          // No session on a business surface. proxy.ts and the
          // (workspace) server layout already gate these routes; this
          // is defense in depth. An anonymous visitor is never rendered
          // a "local-only" business dashboard.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/login");
          return;
        }
        const businesses = await fetchBusinessesForUser();

        // ---- platform-admin "viewing" context ------------------------
        // A viewing marker (written by enterBusinessAsAdmin) is honored
        // ONLY after the database confirms the user is a platform admin
        // (current_is_platform_admin RPC), and only while the target
        // business still exists. The viewed business becomes the EXPLICIT
        // active business with the honest "platform-admin" role — never
        // inferred from arbitrary data, never silently owner-like.
        const viewing = getAdminViewing();
        let active: BusinessInfo | null = null;
        if (viewing) {
          const isAdmin = await checkPlatformAdmin();
          if (cancelled) return;
          if (isAdmin) {
            const memberView = businesses?.find((b) => b.id === viewing.businessId);
            if (memberView) {
              // Admin who is also a member: surface the platform-admin
              // context, not their business-membership role.
              active = { ...memberView, role: "platform-admin" };
            } else if (client) {
              // Not a member: read the business header through the
              // migration-007 businesses SELECT policy. Failure to
              // resolve → stale marker (handled below).
              const q = await client
                .from("businesses")
                .select("id, name, slug, currency")
                .eq("id", viewing.businessId)
                .maybeSingle();
              if (cancelled) return;
              const row = q.data as Record<string, unknown> | null;
              if (row && row.id) {
                active = {
                  id: String(row.id),
                  name:
                    typeof row.name === "string" && row.name
                      ? row.name
                      : viewing.businessName || "Business",
                  slug: typeof row.slug === "string" && row.slug ? row.slug : null,
                  currency: typeof row.currency === "string" && row.currency ? row.currency : "USD",
                  role: "platform-admin",
                };
              }
            }
            if (active) {
              // Make the viewed business the explicit active business so
              // every downstream read is tenant-scoped to it.
              setActiveBusinessId(active.id);
            }
          }
          if (!active) {
            // Stale or illegitimate marker (not an admin / business gone /
            // RLS denies the header read) → drop it and continue with the
            // user's own normal context. Foreign data is never shown.
            clearAdminViewing();
          }
        }
        if (cancelled) return;
        if (!active) {
          if (!businesses || businesses.length === 0) {
            // Signed in but no membership visible (RLS deny / propagation).
            setCloudSyncState("error");
            return;
          }
          const storedId = getActiveBusinessId();
          if (businesses.length > 1 && !businesses.some((b) => b.id === storedId)) {
            // Multiple memberships and no explicit selection — or a stale
            // selection (e.g. this user was removed from the remembered
            // business). Never pick one for the user: the workspace
            // selector decides. The selection stays device-local UI state;
            // access to every record is still enforced per-request by RLS.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/workspaces");
            return;
          }
          active = businesses.find((b) => b.id === storedId) ?? businesses[0];
          if (active.id !== storedId) setActiveBusinessId(active.id);
        }
        setActiveBusiness(active);

        const cloud = await pullBusinessState(active.id);
        if (cancelled) return;


        // ---- deterministic local-snapshot resolution --------------
        // The local snapshot must never leak into another business's
        // context, and the single-user demo (seed) dataset must never be
        // adopted by a business. The active business's cloud state is the
        // ONLY dataset a workspace may show; a business with no rows is
        // genuinely empty (honest empty states) — not another workspace's
        // or the demo's data.
        const ownerTag = getCloudOwnerTag();
        if (ownerTag !== active.id) {
          // New context (or first cloud session): wipe any previous
          // business's local snapshot and start EMPTY. Nothing is ever
          // seeded into a business from the demo dataset, and a previous
          // business's cached rows are never adopted here.
          clearTenantLocalData();
          resetToStarterState();
        }
        // ownerTag === active.id → same-business reload: no wipe; the
        // cloud pull below overwrites every collection, empty included.

        // Apply the business's cloud state wholesale. Empty collections
        // CLEAR the corresponding view rather than leaving prior or demo
        // data visible — cloud is the single source of truth per business.
        replaceAllData({
          accounts: cloud.accounts,
          transactions: cloud.transactions,
          categories: cloud.categories,
          budgets: cloud.budgets,
          goals: cloud.goals,
          plannedTransactions: cloud.plannedTransactions,
          activities: cloud.activities,
        });
        setTodos(cloud.todos);
        setNotifications(cloud.notifications);
        cloud.selectedYear = cloud.selectedYear || DEFAULT_YEAR;
        setSelectedYear(cloud.selectedYear);
        if (cloud.currency && CURRENCIES.some((c) => c.code === cloud.currency)) {
          setCurrency(cloud.currency);
        }
        setCloudOwnerTag(active.id);
        latestStateRef.current = cloud;
        if (active.role !== "platform-admin") {
          saveQueueRef.current = new CloudSaveQueue(active.id, cloud, setCloudSyncState);
        }
        setCloudReady(true);
        setCloudSyncState("synced");
      } catch {
        if (!cancelled) setCloudSyncState("offline");
      }
    })();
    const client = getSupabaseBrowserClient();
    const subscription = client?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        cancelled = true;
        saveQueueRef.current?.stop();
        saveQueueRef.current = null;
        latestStateRef.current = null;
        setCloudReady(false);
        clearTenantLocalData();
        setCloudOwnerTag(null);
        resetToStarterState();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login");
      }
    });
    return () => {
      cancelled = true;
      subscription?.data.subscription.unsubscribe();
      saveQueueRef.current?.stop();
      saveQueueRef.current = null;
      latestStateRef.current = null;
    };
    // Context changes remount through full-page navigation; internal tab changes
    // must not pull over pending edits. Strict Mode cleanup cancels old bootstrap.
  }, [hydrated, cloudEnabled, workspaceSurface]);

  useLayoutEffect(() => {
    const snapshot: CloudState = {
      accounts, transactions, categories, budgets, goals, plannedTransactions,
      activities, notifications, todos, selectedYear: effectiveYear, currency,
    };
    latestStateRef.current = snapshot;
    const queue = saveQueueRef.current;
    if (!cloudReady || !queue || getAdminViewing()) return;
    queue.observe(snapshot);
    // Immediate synchronization for other existing CRUD flows. Entry explicitly
    // awaits the same queue below. A failed write stays pending for retry.
    void queue.flush().catch(() => { /* queue exposes failure through sync status */ });
  }, [accounts, transactions, categories, budgets, goals, plannedTransactions,
    activities, notifications, todos, effectiveYear, currency, cloudReady]);

  const flushCloudChanges = async () => {
    if (!cloudEnabled || activeBusiness?.role === "platform-admin") return;
    const queue = saveQueueRef.current;
    if (!cloudReady || !queue) throw new Error("Workspace is not loaded. Reload before saving.");
    await queue.flush();
  };

  // Entry stays open until commit; stable IDs make retry safe after a
  // timeout or a lost acknowledgement. Now a thin wrapper over
  // commitMutation — the reference pattern every other mutator above follows.
  const saveEntry = async (tx: Transaction) => {
    await commitMutation((state) => {
      const nextTransactions = state.transactions.some((t) => t.id === tx.id)
        ? state.transactions.map((t) => (t.id === tx.id ? tx : t))
        : [...state.transactions, tx];
      return { ...state, transactions: nextTransactions,
        accounts: recomputeBalances(state.accounts, nextTransactions),
        budgets: recomputeBudgetActuals(state.budgets, nextTransactions) };
    });
  };

  useEffect(() => {
    const retry = () => { void saveQueueRef.current?.flush().catch(() => {}); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  // Rebuilt every render (cheap — each entry is either a plain function
  // reference or a trivial inline closure); useStableActions is what makes
  // the RESULT stable across renders, not this object itself. See the
  // useStableActions doc comment above for why this two-step split exists.
  const actions = {
    convertAmount: (value: number, from: string, to?: string): number =>
      convertAmount(value, from, to ?? currency) ?? value,
    replaceAllData,
    setSelectedPeriodId,
    setSelectedYear,
    setSelectedDay,
    setDashboardFilter,
    setCurrency: changeCurrency,
    clearDashboardFilter,
    addActivity,
    updateActivity,
    updateActivityStatus,
    deleteActivity,
    updateGoal,
    updateAccountBalance,
    saveEntry,
    flushCloudChanges,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addAccount,
    updateAccount,
    deleteAccount,
    addCategory,
    updateCategory,
    deleteCategory,
    addBudget,
    updateBudget,
    deleteBudget,
    addGoal,
    deleteGoal,
    addPlanned,
    updatePlanned,
    deletePlanned,
    payPlannedTransaction,
    cancelPlannedTransaction,
  };
  const stableActions = useStableActions(actions);

  // Phase 6: memoized so a DashboardProvider re-render that changes none
  // of these deps (e.g. a parent re-rendering for an unrelated reason)
  // reuses the SAME `value` reference — React then skips notifying every
  // useDashboardData() consumer entirely, instead of every one of them
  // re-rendering on every provider render regardless of what changed.
  // `stableActions` is the one dependency standing in for all ~35 action
  // functions (see useStableActions above) — without it being stable,
  // this useMemo would recompute every render anyway, defeating the point.
  const value: DashboardContextValue = useMemo(() => ({
    accounts,
    transactions,
    categories,
    budgets,
    goals,
    plannedTransactions,
    todos,
    selectedYear: effectiveYear,
    availableYears,
    activities,
    selectedDay,
    notifications,
    dashboardFilter,
    currency,
    baseCurrency,
    displayTransactions,
    displayAccounts,
    displayGoals,
    displayPlannedTransactions,
    fxState,
    activeBusiness,
    cloudSyncState,
    selectedPeriodId,
    periods,
    selectedPeriod,
    kpis,
    monthlyIncomeOutflow,
    incomeSplit,
    outflowTypes,
    cumulativeGrowth,
    netWorthGrowth,
    incomeStreamStack,
    topOutflows,
    topSpendings,
    progress,
    savingsGoal,
    filteredTransactions,
    dayTransactions,
    dayActivities,
    activitiesForWeek,
    todayISO: todayISOValue,
    todayIncome,
    todayOutflow,
    todayNet,
    budgetSummary,
    upcomingRecurring,
    ...stableActions,
  }), [
    accounts, transactions, categories, budgets, goals, plannedTransactions, todos,
    effectiveYear, availableYears, activities, selectedDay, notifications, dashboardFilter,
    currency, baseCurrency, displayTransactions, displayAccounts, displayGoals,
    displayPlannedTransactions, fxState, activeBusiness, cloudSyncState, selectedPeriodId,
    periods, selectedPeriod, kpis, monthlyIncomeOutflow, incomeSplit, outflowTypes,
    cumulativeGrowth, netWorthGrowth, incomeStreamStack, topOutflows, topSpendings, progress,
    savingsGoal, filteredTransactions, dayTransactions, dayActivities, activitiesForWeek,
    todayISOValue, todayIncome, todayOutflow, todayNet, budgetSummary, upcomingRecurring,
    stableActions,
  ]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}