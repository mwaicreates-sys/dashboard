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
  toggleTodo: (id: string) => void;
  addTodo: (text: string) => void;
  updateGoal: (id: string, patch: Partial<NewEntity<Goal>>) => void;
  updateAccountBalance: (id: string, balance: number) => void;
  addTransaction: (tx: Omit<Transaction, "id">) => void;

    addActivity: (data: Omit<Activity, "id">) => void;
  updateActivity: (id: string, patch: Partial<Omit<Activity, "id">>) => void;
  updateActivityStatus: (id: string, status: ActivityStatus) => void;
  deleteActivity: (id: string) => void;

  // ---- notifications & reminders ----
  notifications: Notification[];
  addNotification: (data: Omit<Notification, "id">) => void;
  dismissNotification: (id: string) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  derivedNotifications: Notification[];

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
  notificationsCount: number;

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
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, "id">>) => void;
  deleteTransaction: (id: string) => void;
  /**
   * Bulk-replace whole collections (demo data load / restore). Only the
   * provided arrays are replaced; everything else stays untouched.
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
  addAccount: (data: Omit<Account, "id" | "currentBalance">) => string;
  updateAccount: (id: string, patch: Partial<NewEntity<Account>>) => void;
  deleteAccount: (id: string) => void;
  addCategory: (data: NewEntity<Category>) => string;
  updateCategory: (id: string, patch: Partial<NewEntity<Category>>) => void;
  deleteCategory: (id: string) => void;
  addBudget: (data: NewEntity<Budget>) => void;
  updateBudget: (id: string, patch: Partial<NewEntity<Budget>>) => void;
  deleteBudget: (id: string) => void;
  addGoal: (data: NewEntity<Goal>) => void;
  deleteGoal: (id: string) => void;
    updatePlanned: (id: string, patch: Partial<NewEntity<PlannedTransaction>>) => void;
  addPlanned: (data: NewEntity<PlannedTransaction>) => void;
  deletePlanned: (id: string) => void;

  // ---- payment workflow ----
  /** Pay a planned transaction: creates an actual Transaction, marks it
   *  completed, and seeds the next occurrence for recurring items.
   *  Idempotent — returns false if already paid or a transaction exists.
   */
  payPlannedTransaction: (id: string) => boolean;
  /** Cancel a pending planned transaction without creating a transaction. */
  cancelPlannedTransaction: (id: string) => boolean;
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

const accountDelta = (transactions: Transaction[], accountId: string) =>
  transactions.reduce((sum, t) => {
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
    actualAmount: transactions
      .filter((t) => t.categoryId === b.categoryId && t.date.startsWith(b.month))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, goals, plannedTransactions]);

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

  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("accounts", accounts); }, [hydrated, cloudEnabled, cloudReady, accounts]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("transactions", transactions); }, [hydrated, cloudEnabled, cloudReady, transactions]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("categories", categories); }, [hydrated, cloudEnabled, cloudReady, categories]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("budgets", budgets); }, [hydrated, cloudEnabled, cloudReady, budgets]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("goals", goals); }, [hydrated, cloudEnabled, cloudReady, goals]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("planned", plannedTransactions); }, [hydrated, cloudEnabled, cloudReady, plannedTransactions]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("todos", todos); }, [hydrated, cloudEnabled, cloudReady, todos]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("year", effectiveYear); }, [hydrated, cloudEnabled, cloudReady, effectiveYear]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("currency", currency); }, [hydrated, cloudEnabled, cloudReady, currency]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("activities", activities); }, [hydrated, cloudEnabled, cloudReady, activities]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("selectedDay", selectedDay); }, [hydrated, cloudEnabled, cloudReady, selectedDay]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("notifications", notifications); }, [hydrated, cloudEnabled, cloudReady, notifications]);
  useEffect(() => { if (hydrated && (!cloudEnabled || cloudReady)) saveToStorage("dashboardFilter", dashboardFilter); }, [hydrated, cloudEnabled, cloudReady, dashboardFilter]);

  // ---- display-currency views (RAW records stay untouched & recoverable) ----
  const displayTransactions = useMemo(
    () =>
      transactions.map((t) => ({
        ...t,
        amount: toDisplay(t.amount, txBaseCurrency(t)),
        currency: t.currency ?? txBaseCurrency(t),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, currency, fxTick]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plannedTransactions, currency, fxTick]
  );

  // Every existing calculation now consumes display-currency values so all
  // KPIs, charts, monthlies, growth and goals agree on ONE conversion layer.
  const kpis = useMemo(() => calculateKPIs(displayTransactions, displayAccounts, displayGoals, selectedPeriod || seedPeriods[0]), [displayTransactions, displayAccounts, displayGoals, selectedPeriod]);
  const monthlyIncomeOutflow = useMemo(() => calculateMonthlyIncomeOutflow(displayTransactions, selectedPeriod || seedPeriods[0]), [displayTransactions, selectedPeriod]);
  const incomeSplit = useMemo(() => calculateIncomeSplit(displayTransactions, categories, selectedPeriod || seedPeriods[0]), [displayTransactions, categories, selectedPeriod]);
  const outflowTypes = useMemo(() => calculateOutflowTypes(displayTransactions, categories, selectedPeriod || seedPeriods[0]), [displayTransactions, categories, selectedPeriod]);
  const cumulativeGrowth = useMemo(() => calculateCumulativeGrowth(displayTransactions, selectedPeriod || seedPeriods[0]), [displayTransactions, selectedPeriod]);
  const netWorthGrowth = useMemo(
    () => calculateNetWorthGrowth(displayAccounts, displayTransactions, selectedPeriod || seedPeriods[0]),
    [displayAccounts, displayTransactions, selectedPeriod]
  );
  const incomeStreamStack = useMemo(() => calculateIncomeStreamStack(displayTransactions, categories, selectedPeriod || seedPeriods[0]), [displayTransactions, categories, selectedPeriod]);
  const topOutflows = useMemo(() => calculateTopOutflows(displayTransactions, selectedPeriod || seedPeriods[0]), [displayTransactions, selectedPeriod]);
  const topSpendings = useMemo(() => calculateTopSpendings(displayTransactions, categories, selectedPeriod || seedPeriods[0]), [displayTransactions, categories, selectedPeriod]);
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

    /** Unread notifications count */
  const notificationsCount = useMemo(() => notifications.filter((n) => n.status === "unread").length, [notifications]);

  /** Budgets that are approaching their limit (80%+ used) */
  const budgetWarnings = useMemo(() => {
    return budgets.filter((b) => b.plannedAmount > 0 && (b.actualAmount ?? 0) / b.plannedAmount >= 0.8).length;
  }, [budgets]);

    useEffect(() => {
    const warnings = budgetWarnings;
    if (warnings > 0 && notificationsCount === 0) {
      // Could generate a notification here, but we keep it simple
    }
  }, [budgetWarnings, notificationsCount]);

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
  const todayIncome = useMemo(
    () => todayTxs.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0),
    [todayTxs]
  );
  const todayOutflow = useMemo(
    () => todayTxs.filter((tx) => tx.type === "expense" || tx.type === "transfer").reduce((sum, tx) => sum + tx.amount, 0),
    [todayTxs]
  );
  const todayNet = todayIncome - todayOutflow;

  /**
   * Derived reminders computed from live data (never persisted, never fake):
   * overdue/due-today activities, upcoming scheduled transactions within 7
   * days, budgets ≥80% used this month, and a monthly-review nudge at
   * month-end. Stored (user) notifications are appended after these.
   */
  const derivedNotifications = useMemo<Notification[]>(() => {
    const today = todayISO();
    const in7 = addDaysISO(today, 7);
    const alerts: Notification[] = [];

    for (const a of activities) {
      if (!a.dueDate || a.status === "completed") continue;
      if (a.dueDate < today) {
        alerts.push({
          id: `alert-overdue-${a.id}`,
          title: "Activity overdue",
          message: `“${a.title}” was due ${a.dueDate}.`,
          type: "activity",
          status: "unread",
          date: a.dueDate,
          actionLabel: "Review",
          actionHref: undefined,
        });
      } else if (a.dueDate === today) {
        alerts.push({
          id: `alert-due-${a.id}`,
          title: "Activity due today",
          message: `“${a.title}” is due today.`,
          type: "activity",
          status: "unread",
          date: a.dueDate,
        });
      }
    }

    const month = today.slice(0, 7);
    for (const b of budgets) {
      if (b.month !== month || b.plannedAmount <= 0) continue;
      const pct = Math.round(((b.actualAmount ?? 0) / b.plannedAmount) * 100);
      if (pct >= 80) {
        const catName = categories.find((c) => c.id === b.categoryId)?.name ?? "Budget";
        alerts.push({
          id: `alert-budget-${b.id}`,
          title: pct >= 100 ? "Budget exceeded" : "Budget approaching limit",
          message: `${catName}: ${pct}% of this month's budget used.`,
          type: "budget",
          status: "unread",
          date: today,
        });
      }
    }

    for (const p of plannedTransactions) {
      if (p.status !== "pending" || p.date < today || p.date > in7) continue;
      alerts.push({
        id: `alert-recurring-${p.id}`,
        title: p.recurrence && p.recurrence !== "once" ? "Recurring entry upcoming" : "Scheduled entry upcoming",
        message: `${p.description} — expected ${p.date}.`,
        type: "recurring",
        status: "unread",
        date: p.date,
      });
    }

    const day = Number(today.slice(8, 10));
    if (day >= 28) {
      alerts.push({
        id: "alert-monthly-review",
        title: "Monthly review",
        message: "The month is ending — review spending against your budget.",
        type: "info",
        status: "unread",
        date: today,
      });
    }

    return [...alerts, ...notifications]
      .sort((x, y) => (y.date ?? "").localeCompare(x.date ?? ""))
      .slice(0, 30);
  }, [activities, budgets, categories, plannedTransactions, notifications]);

  const setDashboardFilter = (patch: Partial<DashboardFilter>) => {
    setDashboardFilterValue((prev) => ({ ...prev, ...patch }));
  };

  const clearDashboardFilter = () => {
    setDashboardFilterValue({});
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const addTodo = (text: string) => {
    const newTodo: TodoRow = { id: `t-${Date.now()}`, text, done: false };
    setTodos((prev) => [...prev, newTodo]);
  };

  // ---- activities (day-to-day tracking) ----
  const addActivity = (data: Omit<Activity, "id">) => {
    setActivities((prev) => [
      ...prev,
      { id: `activity-${Date.now()}`, ...data, status: data.status ?? "pending" },
    ]);
  };

  const updateActivity = (id: string, patch: Partial<Omit<Activity, "id">>) => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const deleteActivity = (id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  };

  const updateGoal = (id: string, patch: Partial<NewEntity<Goal>>) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  // ---- data-entry CRUD ----

    const addTransaction = (tx: Omit<Transaction, "id">) => {
    setTransactions((prev) => {
      const next = [...prev, { ...tx, id: nextId("tx") }];
      setAccounts((accs) => recomputeBalances(accs, next));
      setBudgets((bs) => recomputeBudgetActuals(bs, next));
      return next;
    });
  };

    const updateTransaction = (id: string, patch: Partial<Omit<Transaction, "id">>) => {
    setTransactions((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      setAccounts((accs) => recomputeBalances(accs, next));
      setBudgets((bs) => recomputeBudgetActuals(bs, next));
      return next;
    });
  };

  const deleteTransaction = (id: string) => {
    setTransactions((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setAccounts((accs) => recomputeBalances(accs, next));
      setBudgets((bs) => recomputeBudgetActuals(bs, next));
      return next;
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

  const addAccount = (data: Omit<Account, "id" | "currentBalance">) => {
    const newId = nextId("a");
    setAccounts((prev) => [...prev, { id: newId, ...data,
      currentBalance: data.openingBalance, active: data.active ?? true }]);
    return newId;
  };

  const updateAccount = (id: string, patch: Partial<NewEntity<Account>>) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const deleteAccount = (id: string) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, active: false } : a)));
  };

  const addCategory = (data: NewEntity<Category>) => {
    const newId = nextId("c");
    setCategories((prev) => [...prev, { id: newId, ...data }]);
    return newId;
  };

  const updateCategory = (id: string, patch: Partial<NewEntity<Category>>) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const deleteCategory = (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const addBudget = (data: NewEntity<Budget>) => {
    setBudgets((prev) => [
      ...prev,
      { id: nextId("b"), ...data },
    ]);
  };

  const updateBudget = (id: string, patch: Partial<NewEntity<Budget>>) => {
    setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const deleteBudget = (id: string) => {
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  const addGoal = (data: NewEntity<Goal>) => {
    setGoals((prev) => [
      ...prev,
      { id: nextId("g"), ...data, status: data.status ?? "active" },
    ]);
  };

  const deleteGoal = (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const addPlanned = (data: NewEntity<PlannedTransaction>) => {
    setPlannedTransactions((prev) => [
      ...prev,
      { id: nextId("p"), ...data, status: data.status ?? "pending" },
    ]);
  };

  const updatePlanned = (id: string, patch: Partial<NewEntity<PlannedTransaction>>) => {
    setPlannedTransactions((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

    const deletePlanned = (id: string) => {
    setPlannedTransactions((prev) => prev.filter((p) => p.id !== id));
  };

  /**
   * Payment workflow: pay a planned transaction.
   *
   * 1. Idempotency guard (ref) prevents double-processing from rapid clicks
   *    or stale closure reads — survives re-renders without depending on
   *    React state that is asynchronously updated.
   * 2. Duplicate protection: checks whether a Transaction with plannedId === id
   *    already exists. If so, does not create another.
   * 3. Creates an actual Transaction (source of truth) with the planned tx's
   *    details, status "cleared", and plannedId link.
   * 4. addTransaction triggers recomputeBalances (account) + recomputeBudgetActuals.
   * 5. Marks the planned transaction as "completed".
   * 6. For recurring items, creates the next occurrence as a new pending entry.
   *
   * @returns true if payment was newly processed, false if it was a no-op.
   */
  const paidIdsRef = useRef<Set<string>>(new Set());

  const payPlannedTransaction = (id: string): boolean => {
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
      updatePlanned(id, { status: "completed" });
      return false;
    }

    // Create the actual transaction (transactions are the source of truth).
    // addTransaction also triggers recomputeBalances + recomputeBudgetActuals.
    addTransaction({
      date: planned.date,
      accountId: planned.accountId,
      categoryId: planned.categoryId,
      description: planned.description,
      amount: planned.amount,
      type: planned.type,
      status: "cleared",
      plannedId: id,
      toAccountId: planned.toAccountId,
      currency: planned.currency,
    });

    // Mark the planned transaction as completed and lock it
    paidIdsRef.current.add(id);
    updatePlanned(id, { status: "completed" });

    // Seed the next occurrence for recurring items (keeps each occurrence
    // independently payable — paying August does not mark September as paid).
    if (planned.recurrence === "monthly" || planned.recurrence === "yearly") {
      const monthsToAdd = planned.recurrence === "monthly" ? 1 : 12;
      addPlanned({
        date: addMonths(planned.date, monthsToAdd),
        accountId: planned.accountId,
        categoryId: planned.categoryId,
        description: planned.description,
        amount: planned.amount,
        type: planned.type,
        status: "pending",
        recurrence: planned.recurrence,
        toAccountId: planned.toAccountId,
        currency: planned.currency,
      });
    }

    return true;
  };

  /**
   * Cancel a planned transaction without creating an actual transaction.
   * Does NOT affect account balances or budget actuals.
   */
  const cancelPlannedTransaction = (id: string): boolean => {
    const planned = plannedTransactions.find((p) => p.id === id);
    if (!planned || planned.status !== "pending") return false;
    updatePlanned(id, { status: "cancelled" });
    return true;
  };

    const updateAccountBalance = (id: string, balance: number) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, currentBalance: balance } : a)));
  };

  // ---- activity status shorthand ----
  const updateActivityStatus = (id: string, status: ActivityStatus) => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  // ---- notifications ----
    const addNotification = (data: Omit<Notification, "id">) => {
    setNotifications((prev) => [
      ...prev,
      { id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...data, status: "unread" },
    ]);
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

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

  const saveEntry = async (tx: Transaction) => {
    const queue = saveQueueRef.current;
    if (cloudEnabled && (!cloudReady || !queue || getAdminViewing())) {
      throw new Error("Workspace is not ready for saving. Reload and try again.");
    }
    const current = latestStateRef.current;
    if (!current) throw new Error("Workspace is still loading.");
    const nextTransactions = current.transactions.some((t) => t.id === tx.id)
      ? current.transactions.map((t) => t.id === tx.id ? tx : t)
      : [...current.transactions, tx];
    const next = { ...current, transactions: nextTransactions,
      accounts: recomputeBalances(current.accounts, nextTransactions),
      budgets: recomputeBudgetActuals(current.budgets, nextTransactions) };
    // Keep the existing immediate preview, but Entry stays open until commit.
    // Stable IDs make retry safe after a timeout or a lost acknowledgement.
    latestStateRef.current = next;
    queue?.observe(next);
    setTransactions(next.transactions);
    setAccounts(next.accounts);
    setBudgets(next.budgets);
    await queue?.flush();
  };

  useEffect(() => {
    const retry = () => { void saveQueueRef.current?.flush().catch(() => {}); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

    const value: DashboardContextValue = {
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
    convertAmount: (value: number, from: string, to?: string): number =>
      convertAmount(value, from, to ?? currency) ?? value,
    replaceAllData,
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
    notificationsCount,
    derivedNotifications,
    setSelectedPeriodId,
    setSelectedYear,
    setSelectedDay,
    setDashboardFilter,
    setCurrency: changeCurrency,
    clearDashboardFilter,
    toggleTodo,
    addTodo,
    addActivity,
    updateActivity,
    updateActivityStatus,
    deleteActivity,
    addNotification,
    dismissNotification,
    markNotificationRead,
    clearNotifications,
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

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}