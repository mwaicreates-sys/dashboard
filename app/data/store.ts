import {
  Account,
  Transaction,
  Category,
  Budget,
  Goal,
  PlannedTransaction,
  PlannedTransactionStatus,
  PeriodConfig,
  NewEntity,
} from "./model/types";
import {
  accounts as seedAccounts,
  transactions as seedTransactions,
  categories as seedCategories,
  budgets as seedBudgets,
  goals as seedGoals,
  plannedTransactions as seedPlannedTransactions,
} from "./seed";

// ============================================================
// Finance Data Store
//
// A lightweight, framework-agnostic, typed local data layer for
// the Budgeting System. It provides full CRUD access to every
// financial entity plus consistency helpers (account balances
// derived from transactions, budget actuals derived from
// transactions) so the application can support a future
// data-entry UI.
//
// Usage:
//   const store = createFinanceDataStore(initialState);
//   const tx = store.addTransaction({ ... });
//   const persisted = store.snapshot();        // save anywhere
//   store.load(previousSnapshot);              // restore
//
// NOTE: This module is intentionally NOT tied to React or
// localStorage. The dashboard state provider (app/lib/
// dashboardData.tsx) owns React/persistence concerns and can
// call into these functions for consistency guarantees.
// ============================================================

// ------------------------------------------------------------
// ID generation
// ------------------------------------------------------------

/** Generate the next sequential id for a prefix, e.g. "tx-8". */
export function nextId(prefix: string, existing: string[]): string {
  let max = 0;
  for (const id of existing) {
    const match = /(\d+)$/.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${max + 1}`;
}

/**
 * Shift an ISO date string ("YYYY-MM-DD") forward by `months` months.
 * Handles month/year rollover and clamps the day to the end of the month.
 */
export function addMonths(dateStr: string, months: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const da = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
}

// ------------------------------------------------------------
// Account consistency helpers
// ------------------------------------------------------------

/**
 * Net change for one account given the transaction list.
 *  - income on `accountId`                      → +amount
 *  - expense / transfer on `accountId`          → -amount
 *  - transfer with `toAccountId === accountId`  → +amount
 */
export function accountDelta(
  transactions: Transaction[],
  accountId: string
): number {
  return transactions.reduce((sum, t) => {
    let delta = 0;
    if (t.accountId === accountId) {
      if (t.type === "income") delta += t.amount;
      else if (t.type === "expense" || t.type === "transfer") delta -= t.amount;
    }
    if (t.toAccountId === accountId) delta += t.amount;
    return sum + delta;
  }, 0);
}

/** Recompute an account's currentBalance from its openingBalance + transactions. */
export function recomputeAccountBalance(
  account: Account,
  transactions: Transaction[]
): number {
  return account.openingBalance + accountDelta(transactions, account.id);
}

/** Recompute every account's currentBalance in place-compatible form. */
export function recomputeAllAccountBalances(
  accounts: Account[],
  transactions: Transaction[]
): Account[] {
  return accounts.map((a) => ({
    ...a,
    currentBalance: recomputeAccountBalance(a, transactions),
  }));
}

// ------------------------------------------------------------
// Budget consistency helpers
// ------------------------------------------------------------

/** Actual spend for a category in a given month from posted transactions. */
export function recomputeBudgetActual(
  transactions: Transaction[],
  budget: Pick<Budget, "month" | "categoryId">
): number {
  return transactions
    .filter(
      (t) =>
        t.categoryId === budget.categoryId &&
        t.date.startsWith(budget.month)
    )
    .reduce((sum, t) => sum + t.amount, 0);
}

// ------------------------------------------------------------
// Transaction factory
// ------------------------------------------------------------

/**
 * Normalise arbitrary transaction input into a complete
 * Transaction record. Assigns the next id and defaults the
 * status to "cleared" when omitted.
 */
export function toTransaction(
  data: NewEntity<Transaction>,
  existingIds: string[]
): Transaction {
  return {
    id: nextId("tx", existingIds),
    date: data.date,
    accountId: data.accountId,
    categoryId: data.categoryId,
    type: data.type,
    amount: data.amount,
    description: data.description,
    status: data.status ?? "cleared",
    notes: data.notes,
    plannedId: data.plannedId,
    toAccountId: data.toAccountId,
    currency: data.currency,
  };
}

// ------------------------------------------------------------
// Store factory
// ------------------------------------------------------------

export interface FinanceDataInitialState {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  goals: Goal[];
  plannedTransactions: PlannedTransaction[];
}

export interface FinanceDataStore extends FinanceDataInitialState {
  // --- lookup ---
  getAccount(id: string): Account | undefined;
  getTransaction(id: string): Transaction | undefined;
  getCategory(id: string): Category | undefined;
  getBudget(id: string): Budget | undefined;
  getGoal(id: string): Goal | undefined;
  getPlannedTransaction(id: string): PlannedTransaction | undefined;

  // --- filtered views ---
  transactionsByAccount(accountId: string): Transaction[];
  transactionsByCategory(categoryId: string): Transaction[];
  transactionsByMonth(month: string): Transaction[];
  budgetsForPeriod(periodId: string): Budget[];
  budgetsForCategoryAndMonth(
    categoryId: string,
    month: string
  ): Budget | undefined;

  // --- accounts ---
  addAccount(data: NewEntity<Account>): Account;
  updateAccount(id: string, patch: Partial<NewEntity<Account>>): void;
  /** Soft delete — flags the account inactive. */
  deleteAccount(id: string): void;

  // --- categories ---
  addCategory(data: NewEntity<Category>): Category;
  updateCategory(id: string, patch: Partial<NewEntity<Category>>): void;
  deleteCategory(id: string): void;

  // --- transactions (keeps account balances consistent) ---
  addTransaction(data: NewEntity<Transaction>): Transaction;
  updateTransaction(id: string, patch: Partial<NewEntity<Transaction>>): void;
  deleteTransaction(id: string): void;

  // --- budgets (actuals kept in sync) ---
  addBudget(data: NewEntity<Budget>): Budget;
  updateBudget(id: string, patch: Partial<NewEntity<Budget>>): void;
  deleteBudget(id: string): void;

  // --- goals ---
  addGoal(data: NewEntity<Goal>): Goal;
  updateGoal(id: string, patch: Partial<NewEntity<Goal>>): void;
  deleteGoal(id: string): void;

  // --- planned transactions ---
  addPlannedTransaction(data: NewEntity<PlannedTransaction>): PlannedTransaction;
  updatePlannedTransaction(
    id: string,
    patch: Partial<NewEntity<PlannedTransaction>>
  ): void;
    deletePlannedTransaction(id: string): void;

  /**
   * Pay a planned transaction: creates an actual Transaction linked via
   * plannedId, marks the planned transaction "completed", and (for
   * recurring items) seeds the next occurrence as a new pending entry.
   * Idempotent — returns { created: false } if a transaction already
   * exists for the planned transaction or it is already completed.
   */
  payPlannedTransaction(id: string): { created: boolean; transactionId?: string; nextOccurrenceId?: string };
  /** Cancel a pending planned transaction without creating a transaction. */
  cancelPlannedTransaction(id: string): boolean;

  // --- persistence / reset ---
  /** Deep-copy snapshot for persistence. */
  snapshot(): FinanceDataInitialState;
  /** Replace all state from a snapshot. */
  load(state: FinanceDataInitialState): void;
  /** Restore the seed data into the store. */
  reset(): void;
}

export function createFinanceDataStore(
  initialState: FinanceDataInitialState
): FinanceDataStore {
  const state: FinanceDataInitialState = {
    accounts: [...initialState.accounts],
    transactions: [...initialState.transactions],
    categories: [...initialState.categories],
    budgets: [...initialState.budgets],
    goals: [...initialState.goals],
    plannedTransactions: [...initialState.plannedTransactions],
  };

  const accountIds = () => state.accounts.map((a) => a.id);
  const categoryIds = () => state.categories.map((c) => c.id);
  const transactionIds = () => state.transactions.map((t) => t.id);
  const budgetIds = () => state.budgets.map((b) => b.id);
  const goalIds = () => state.goals.map((g) => g.id);
  const plannedIds = () => state.plannedTransactions.map((p) => p.id);

  return {
    // --- collections (live references) ---
    accounts: state.accounts,
    transactions: state.transactions,
    categories: state.categories,
    budgets: state.budgets,
    goals: state.goals,
    plannedTransactions: state.plannedTransactions,

    // --- lookup ---
    getAccount(id) {
      return state.accounts.find((a) => a.id === id);
    },
    getTransaction(id) {
      return state.transactions.find((t) => t.id === id);
    },
    getCategory(id) {
      return state.categories.find((c) => c.id === id);
    },
    getBudget(id) {
      return state.budgets.find((b) => b.id === id);
    },
    getGoal(id) {
      return state.goals.find((g) => g.id === id);
    },
    getPlannedTransaction(id) {
      return state.plannedTransactions.find((p) => p.id === id);
    },

    // --- filtered views ---
    transactionsByAccount(accountId) {
      return state.transactions.filter(
        (t) => t.accountId === accountId || t.toAccountId === accountId
      );
    },
    transactionsByCategory(categoryId) {
      return state.transactions.filter((t) => t.categoryId === categoryId);
    },
    transactionsByMonth(month) {
      return state.transactions.filter((t) => t.date.startsWith(month));
    },
    budgetsForPeriod(periodId) {
      return state.budgets.filter((b) => b.periodId === periodId);
    },
    budgetsForCategoryAndMonth(categoryId, month) {
      return state.budgets.find(
        (b) => b.categoryId === categoryId && b.month === month
      );
    },

    // --- accounts ---
    addAccount(data) {
      const account: Account = {
        id: nextId("a", accountIds()),
        name: data.name,
        type: data.type,
        openingBalance: data.openingBalance,
        currentBalance:
          data.currentBalance ?? data.openingBalance,
        currency: data.currency,
        institution: data.institution,
        active: data.active ?? true,
      };
      state.accounts.push(account);
      return account;
    },
    updateAccount(id, patch) {
      const idx = state.accounts.findIndex((a) => a.id === id);
      if (idx === -1) return;
      state.accounts[idx] = { ...state.accounts[idx], ...patch };
    },
    deleteAccount(id) {
      state.accounts = state.accounts.map((a) =>
        a.id === id ? { ...a, active: false } : a
      );
    },

    // --- categories ---
    addCategory(data) {
      const category: Category = {
        id: nextId("c", categoryIds()),
        name: data.name,
        group: data.group,
        type: data.type,
        color: data.color,
        parentId: data.parentId,
      };
      state.categories.push(category);
      return category;
    },
    updateCategory(id, patch) {
      const idx = state.categories.findIndex((c) => c.id === id);
      if (idx === -1) return;
      state.categories[idx] = { ...state.categories[idx], ...patch };
    },
    deleteCategory(id) {
      state.categories = state.categories.filter((c) => c.id !== id);
    },

    // --- transactions ---
    addTransaction(data) {
      const tx = toTransaction(data, transactionIds());
      state.transactions.push(tx);
      state.accounts = recomputeAllAccountBalances(
        state.accounts,
        state.transactions
      );
      return tx;
    },
    updateTransaction(id, patch) {
      const idx = state.transactions.findIndex((t) => t.id === id);
      if (idx === -1) return;
      state.transactions[idx] = { ...state.transactions[idx], ...patch };
      state.accounts = recomputeAllAccountBalances(
        state.accounts,
        state.transactions
      );
    },
    deleteTransaction(id) {
      state.transactions = state.transactions.filter((t) => t.id !== id);
      state.accounts = recomputeAllAccountBalances(
        state.accounts,
        state.transactions
      );
    },

    // --- budgets ---
    addBudget(data) {
      const budget: Budget = {
        id: nextId("b", budgetIds()),
        categoryId: data.categoryId,
        periodId: data.periodId,
        month: data.month,
        plannedAmount: data.plannedAmount,
        actualAmount:
          data.actualAmount ??
          recomputeBudgetActual(state.transactions, data),
      };
      state.budgets.push(budget);
      return budget;
    },
    updateBudget(id, patch) {
      const idx = state.budgets.findIndex((b) => b.id === id);
      if (idx === -1) return;
      state.budgets[idx] = { ...state.budgets[idx], ...patch };
    },
    deleteBudget(id) {
      state.budgets = state.budgets.filter((b) => b.id !== id);
    },

    // --- goals ---
    addGoal(data) {
      const goal: Goal = {
        id: nextId("g", goalIds()),
        name: data.name,
        targetAmount: data.targetAmount,
        currentAmount: data.currentAmount,
        targetDate: data.targetDate,
        status: data.status ?? "active",
        currency: data.currency,
      };
      state.goals.push(goal);
      return goal;
    },
    updateGoal(id, patch) {
      const idx = state.goals.findIndex((g) => g.id === id);
      if (idx === -1) return;
      state.goals[idx] = { ...state.goals[idx], ...patch };
    },
    deleteGoal(id) {
      state.goals = state.goals.filter((g) => g.id !== id);
    },

      // --- planned transactions ---
    addPlannedTransaction(data) {
      const planned: PlannedTransaction = {
        id: nextId("p", plannedIds()),
        date: data.date,
        accountId: data.accountId,
        categoryId: data.categoryId,
        description: data.description,
        amount: data.amount,
        type: data.type,
        status: data.status ?? "pending",
        recurrence: data.recurrence,
        toAccountId: data.toAccountId,
        currency: data.currency,
      };
      state.plannedTransactions.push(planned);
      return planned;
    },
    updatePlannedTransaction(id, patch) {
      const idx = state.plannedTransactions.findIndex((p) => p.id === id);
      if (idx === -1) return;
      state.plannedTransactions[idx] = { ...state.plannedTransactions[idx], ...patch };
    },
        deletePlannedTransaction(id) {
      state.plannedTransactions = state.plannedTransactions.filter(
        (p) => p.id !== id
      );
    },

    // --- payment workflow ---
    payPlannedTransaction(id) {
      const planned = state.plannedTransactions.find((p) => p.id === id);
      if (!planned) return { created: false };

      // Idempotency: if already completed and a transaction exists, do nothing
      if (planned.status === "completed") {
        const existing = state.transactions.find((t) => t.plannedId === planned.id);
        if (existing) return { created: false, transactionId: existing.id };
      }

      // Duplicate protection: if a transaction already exists for this
      // planned transaction, don't create another one
      const existingTx = state.transactions.find((t) => t.plannedId === id);
      if (existingTx) {
        // Transaction exists but planned is not completed — sync the status
        if (planned.status !== "completed") {
          state.plannedTransactions = state.plannedTransactions.map((p) =>
            p.id === id ? { ...p, status: "completed" } : p
          );
        }
        state.accounts = recomputeAllAccountBalances(state.accounts, state.transactions);
        return { created: false, transactionId: existingTx.id };
      }

      // Create the actual transaction (transactions are the source of truth)
      const tx = toTransaction(
        {
          date: planned.date,
          accountId: planned.accountId,
          categoryId: planned.categoryId,
          type: planned.type,
          amount: planned.amount,
          description: planned.description,
          status: "cleared",
          plannedId: id,
          toAccountId: planned.toAccountId,
          currency: planned.currency,
        },
        transactionIds()
      );
      state.transactions.push(tx);

      // Mark the planned transaction as completed
      state.plannedTransactions = state.plannedTransactions.map((p) =>
        p.id === id ? { ...p, status: "completed" } : p
      );

      // Recompute account balances from the new transaction set
      state.accounts = recomputeAllAccountBalances(
        state.accounts,
        state.transactions
      );

      // For recurring items, seed the next occurrence as a new pending entry
      let nextOccurrenceId: string | undefined;
      if (planned.recurrence === "monthly" || planned.recurrence === "yearly") {
        const monthsToAdd = planned.recurrence === "monthly" ? 1 : 12;
        const nextDate = addMonths(planned.date, monthsToAdd);
        const nextPlanned = {
          id: nextId("p", plannedIds()),
          date: nextDate,
          accountId: planned.accountId,
          categoryId: planned.categoryId,
          description: planned.description,
          amount: planned.amount,
          type: planned.type,
          status: "pending" as PlannedTransactionStatus,
          recurrence: planned.recurrence,
          toAccountId: planned.toAccountId,
        };
        state.plannedTransactions.push(nextPlanned);
        nextOccurrenceId = nextPlanned.id;
      }

      return { created: true, transactionId: tx.id, nextOccurrenceId };
    },
    cancelPlannedTransaction(id) {
      const planned = state.plannedTransactions.find((p) => p.id === id);
      if (!planned || planned.status !== "pending") return false;
      state.plannedTransactions = state.plannedTransactions.map((p) =>
        p.id === id ? { ...p, status: "cancelled" } : p
      );
      return true;
    },

    // --- persistence / reset ---
    snapshot() {
      return {
        accounts: state.accounts.map((a) => ({ ...a })),
        transactions: state.transactions.map((t) => ({ ...t })),
        categories: state.categories.map((c) => ({ ...c })),
        budgets: state.budgets.map((b) => ({ ...b })),
        goals: state.goals.map((g) => ({ ...g })),
        plannedTransactions: state.plannedTransactions.map((p) => ({ ...p })),
      };
    },
    load(next) {
      state.accounts = [...next.accounts];
      state.transactions = [...next.transactions];
      state.categories = [...next.categories];
      state.budgets = [...next.budgets];
      state.goals = [...next.goals];
      state.plannedTransactions = [...next.plannedTransactions];
    },
    reset() {
      state.accounts = [...seedAccounts];
      state.transactions = [...seedTransactions];
      state.categories = [...seedCategories];
      state.budgets = [...seedBudgets];
      state.goals = [...seedGoals];
      state.plannedTransactions = [...seedPlannedTransactions];
    },
  };
}

// ------------------------------------------------------------
// Convenience: entries mapping for data-entry UI pickers
// ------------------------------------------------------------
export interface EntryOption {
  id: string;
  label: string;
}

export function toEntryOptions<T extends { id: string; name: string }>(
  items: T[]
): EntryOption[] {
  return items.map((i) => ({ id: i.id, label: i.name }));
}

export type { PeriodConfig };