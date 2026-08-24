"use client";

import React, { createContext, useContext, useMemo, useState, useEffect, useRef } from "react";
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
  NewEntity,
} from "@/data/model/types";
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
import { getPeriodById } from "@/lib/period";
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

interface DashboardState {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  goals: Goal[];
  plannedTransactions: PlannedTransaction[];
  todos: TodoRow[];
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
  incomeStreamStack: Record<string, { salary: number; freelance: number; investments: number; other: number }>;
  topOutflows: OutflowRow[];
  topSpendings: SpendingRow[];
  progress: ProgressRow[];
  savingsGoal: DonutRow[];
  setSelectedPeriodId: (id: string) => void;
  toggleTodo: (id: string) => void;
  addTodo: (text: string) => void;
  updateGoal: (id: string, patch: Partial<NewEntity<Goal>>) => void;
  updateAccountBalance: (id: string, balance: number) => void;
  addTransaction: (tx: Omit<Transaction, "id">) => void;

  // ---- data-entry CRUD ----
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, "id">>) => void;
  deleteTransaction: (id: string) => void;
  addAccount: (data: Omit<Account, "id" | "currentBalance">) => void;
  updateAccount: (id: string, patch: Partial<NewEntity<Account>>) => void;
  deleteAccount: (id: string) => void;
  addCategory: (data: NewEntity<Category>) => void;
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

const nextId = (prefix: string, existing: string[]) => {
  let max = 0;
  for (const id of existing) {
    const match = /(\d+)$/.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${max + 1}`;
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
  const [accounts, setAccounts] = useState<Account[]>(() => loadFromStorage("accounts", seedAccounts));
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadFromStorage("transactions", seedTransactions));
  const [categories, setCategories] = useState<Category[]>(() => loadFromStorage("categories", seedCategories));
  const [budgets, setBudgets] = useState<Budget[]>(() => loadFromStorage("budgets", seedBudgets));
  const [goals, setGoals] = useState<Goal[]>(() => loadFromStorage("goals", seedGoals));
  const [plannedTransactions, setPlannedTransactions] = useState<PlannedTransaction[]>(() => loadFromStorage("planned", seedPlanned));
  const [todos, setTodos] = useState<TodoRow[]>(() => loadFromStorage("todos", initialTodos));
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(() => loadFromStorage("period", "2025-2026"));

  const selectedPeriod = useMemo(() => getPeriodById(selectedPeriodId), [selectedPeriodId]);

  useEffect(() => { saveToStorage("accounts", accounts); }, [accounts]);
  useEffect(() => { saveToStorage("transactions", transactions); }, [transactions]);
  useEffect(() => { saveToStorage("categories", categories); }, [categories]);
  useEffect(() => { saveToStorage("budgets", budgets); }, [budgets]);
  useEffect(() => { saveToStorage("goals", goals); }, [goals]);
  useEffect(() => { saveToStorage("planned", plannedTransactions); }, [plannedTransactions]);
  useEffect(() => { saveToStorage("todos", todos); }, [todos]);
  useEffect(() => { saveToStorage("period", selectedPeriodId); }, [selectedPeriodId]);

  const kpis = useMemo(() => calculateKPIs(transactions, accounts, goals, selectedPeriod || seedPeriods[0]), [transactions, accounts, goals, selectedPeriod]);
  const monthlyIncomeOutflow = useMemo(() => calculateMonthlyIncomeOutflow(transactions, selectedPeriod || seedPeriods[0]), [transactions, selectedPeriod]);
  const incomeSplit = useMemo(() => calculateIncomeSplit(transactions, categories, selectedPeriod || seedPeriods[0]), [transactions, categories, selectedPeriod]);
  const outflowTypes = useMemo(() => calculateOutflowTypes(transactions, categories, selectedPeriod || seedPeriods[0]), [transactions, categories, selectedPeriod]);
  const cumulativeGrowth = useMemo(() => calculateCumulativeGrowth(transactions, selectedPeriod || seedPeriods[0]), [transactions, selectedPeriod]);
  const netWorthGrowth = useMemo(() => calculateNetWorthGrowth(accounts), [accounts]);
  const incomeStreamStack = useMemo(() => calculateIncomeStreamStack(transactions, categories, selectedPeriod || seedPeriods[0]), [transactions, categories, selectedPeriod]);
  const topOutflows = useMemo(() => calculateTopOutflows(transactions, selectedPeriod || seedPeriods[0]), [transactions, selectedPeriod]);
  const topSpendings = useMemo(() => calculateTopSpendings(transactions, categories, selectedPeriod || seedPeriods[0]), [transactions, categories, selectedPeriod]);
  const progress = useMemo(() => calculateProgress(goals), [goals]);
  const savingsGoal = useMemo(() => calculateSavingsGoal(accounts, goals), [accounts, goals]);

  const toggleTodo = (id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const addTodo = (text: string) => {
    const newTodo: TodoRow = { id: `t-${Date.now()}`, text, done: false };
    setTodos((prev) => [...prev, newTodo]);
  };

  const updateGoal = (id: string, patch: Partial<NewEntity<Goal>>) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  // ---- data-entry CRUD ----

    const addTransaction = (tx: Omit<Transaction, "id">) => {
    setTransactions((prev) => {
      const next = [...prev, { ...tx, id: nextId("tx", prev.map((t) => t.id)) }];
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

  const addAccount = (data: Omit<Account, "id" | "currentBalance">) => {
    setAccounts((prev) => [
      ...prev,
      {
        id: nextId("a", prev.map((a) => a.id)),
        ...data,
        currentBalance: data.openingBalance,
        active: data.active ?? true,
      },
    ]);
  };

  const updateAccount = (id: string, patch: Partial<NewEntity<Account>>) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const deleteAccount = (id: string) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, active: false } : a)));
  };

  const addCategory = (data: NewEntity<Category>) => {
    setCategories((prev) => [
      ...prev,
      { id: nextId("c", prev.map((c) => c.id)), ...data },
    ]);
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
      { id: nextId("b", prev.map((b) => b.id)), ...data },
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
      { id: nextId("g", prev.map((g) => g.id)), ...data, status: data.status ?? "active" },
    ]);
  };

  const deleteGoal = (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const addPlanned = (data: NewEntity<PlannedTransaction>) => {
    setPlannedTransactions((prev) => [
      ...prev,
      { id: nextId("p", prev.map((p) => p.id)), ...data, status: data.status ?? "pending" },
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

  const value: DashboardContextValue = {
    accounts,
    transactions,
    categories,
    budgets,
    goals,
    plannedTransactions,
    todos,
    selectedPeriodId,
    periods: seedPeriods,
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
    setSelectedPeriodId,
    toggleTodo,
    addTodo,
    updateGoal,
    updateAccountBalance,
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