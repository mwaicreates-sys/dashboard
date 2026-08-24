import {
  Account,
  Transaction,
  Category,
  Budget,
  Goal,
  PlannedTransaction,
  TodoRow,
  CategoryGroup,
  CategoryType,
} from "./model/types";
import { periods } from "@/lib/period";

// ============================================================
// Period configuration (canonical source: app/lib/period.ts)
// ============================================================
export { periods };
export const DEFAULT_PERIOD_ID = periods[0].id;

// ============================================================
// Categories
// ============================================================
function cat(
  id: string,
  name: string,
  group: CategoryGroup,
  type: CategoryType,
  color: string
): Category {
  return { id, name, group, type, color };
}

export const categories: Category[] = [
  // Income
  cat("c1", "Salary", "income", "income", "#3B7A9E"),
  cat("c2", "Freelance", "income", "income", "#4A909B"),
  cat("c3", "Investment Income", "income", "income", "#5B8C5A"),
  cat("c4", "Other Income", "income", "income", "#F4B860"),
  // Savings
  cat("c5", "Emergency Fund", "savings", "expense", "#A37AB4"),
  cat("c6", "General Savings", "savings", "expense", "#7B8FA1"),
  // Investments
  cat("c7", "Investments", "investments", "expense", "#3B7A9E"),
  cat("c8", "Retirement", "investments", "expense", "#4A6FA5"),
  // Bills
  cat("c9", "Rent", "bills", "expense", "#E87A5D"),
  cat("c10", "Utilities", "bills", "expense", "#D9A05B"),
  cat("c11", "Internet", "bills", "expense", "#6BA6A0"),
  cat("c12", "Insurance", "bills", "expense", "#D96B82"),
  cat("c13", "Subscriptions", "bills", "expense", "#8E9AAF"),
  // Expenses
  cat("c14", "Groceries", "expenses", "expense", "#7BAE7F"),
  cat("c15", "Dining", "expenses", "expense", "#E8A87C"),
  cat("c16", "Transportation", "expenses", "expense", "#4A909B"),
  cat("c17", "Shopping", "expenses", "expense", "#D96B82"),
  cat("c18", "Entertainment", "expenses", "expense", "#B48EAD"),
  cat("c19", "Healthcare", "expenses", "expense", "#78C6A3"),
  cat("c20", "Personal", "expenses", "expense", "#A3A380"),
  cat("c21", "Other", "expenses", "expense", "#999999"),
  // Debt
  cat("c22", "Credit Card", "debt", "expense", "#C9605E"),
  cat("c23", "Loan Payments", "debt", "expense", "#8D6E63"),
];

// ============================================================
// Accounts
//
// `currentBalance` is DERIVED from the transaction list below so
// the seed is internally consistent by construction:
//   openingBalance + inflows − outflows = currentBalance
// ============================================================
export const ACCOUNT_OPENINGS: Array<{ id: string; openingBalance: number }> = [
  { id: "a1", openingBalance: 9000 },
  { id: "a2", openingBalance: 68500 },
  { id: "a3", openingBalance: 18000 },
  { id: "a4", openingBalance: -4800 },
  { id: "a5", openingBalance: -7500 },
];

// ============================================================
// Monthly flow plan (USD)
//
// All recurring movements are defined once here and fanned out
// across the 12 months of period 2025-07 → 2026-06. One-off
// transactions (bonus, gifts, tax prep, car maintenance) are
// appended separately so balances reconcile exactly.
// ============================================================
const BASE_MONTHLY = {
  salary: 5200,
  freelance: 420,
  otherIncome: 80,
  dividends: 130, // into Investment account
  rent: 1500,
  utilities: 190,
  internet: 70,
  insurance: 210,
  subscriptions: 45,
  groceries: 600,
  dining: 260,
  transport: 260,
  shopping: 140,
  entertainment: 120,
  healthcare: 100,
  personal: 120,
  other: 100,
  creditCard: 240, // transfer a1 → a4
  carLoan: 350, // transfer a1 → a5
  emergency: 400, // transfer a1 → a2
  generalSavings: 280, // transfer a1 → a2
  investments: 350, // transfer a1 → a3
  retirement: 550, // transfer a1 → a3
} as const;

// Salary increases to $5,400/mo starting Jan 2026
const BASE_SALARY = 5200;
const RAISED_SALARY = 5400;
const FREELANCE_BY_MONTH: number[] = [
  420, 380, 460, 440, 400, 520,
  450, 410, 480, 450, 500, 480,
];

interface OneOff {
  date: string;
  type: Transaction["type"];
  amount: number;
  categoryId: string;
  accountId: string;
  toAccountId?: string;
  description: string;
  notes?: string;
}

const ONE_OFFS: OneOff[] = [
  {
    date: "2025-12-15",
    type: "income",
    amount: 2400,
    categoryId: "c4",
    accountId: "a1",
    description: "Annual Bonus",
    notes: "Year-end performance bonus",
  },
  {
    date: "2025-12-20",
    type: "expense",
    amount: 200,
    categoryId: "c17",
    accountId: "a1",
    description: "Holiday Gifts",
    notes: "Holiday gifts for family",
  },
  {
    date: "2025-12-25",
    type: "expense",
    amount: 90,
    categoryId: "c18",
    accountId: "a1",
    description: "Holiday Events",
    notes: "Seasonal celebrations",
  },
  {
    date: "2026-03-10",
    type: "expense",
    amount: 320,
    categoryId: "c21",
    accountId: "a1",
    description: "Tax Preparation",
    notes: "Annual tax filing service",
  },
  {
    date: "2026-05-08",
    type: "expense",
    amount: 450,
    categoryId: "c16",
    accountId: "a1",
    description: "Car Maintenance",
    notes: "Brakes and oil service",
  },
];

// ============================================================
// Transactions
// ============================================================
export const transactions: Transaction[] = [];

let txId = 1;

const months = periods[0].months;

for (const month of months) {
  const [year, m] = month.split("-").map(Number);
  const daysInMonth = new Date(year, m, 0).getDate();
  const monthIndex = periods[0].months.indexOf(month); // 0..11
  const salaryAmount = monthIndex >= 6 ? RAISED_SALARY : BASE_SALARY;

  const push = (
    day: number,
    type: Transaction["type"],
    amount: number,
    categoryId: string,
    accountId: string,
    description: string,
    extra?: { toAccountId?: string; notes?: string }
  ) => {
    transactions.push({
      id: `tx-${txId++}`,
      date: new Date(year, m - 1, Math.min(day, daysInMonth)).toISOString().split("T")[0],
      accountId,
      categoryId,
      type,
      amount,
      description,
      status: "cleared",
      notes: extra?.notes,
      toAccountId: extra?.toAccountId,
    });
  };

  // --- Income (into Checking) ---
  push(1, "income", salaryAmount, "c1", "a1", "Salary Deposit", { notes: "MONTHLY_SALARY" });
  push(15, "income", FREELANCE_BY_MONTH[monthIndex], "c2", "a1", "Freelance Project");
  push(20, "income", BASE_MONTHLY.otherIncome, "c4", "a1", "Other Income");
  // --- Dividend income (into Investment) ---
  push(10, "income", BASE_MONTHLY.dividends, "c3", "a3", "Investment Dividends");

  // --- Bills (Checking) ---
  push(1, "expense", BASE_MONTHLY.rent, "c9", "a1", "Monthly Rent");
  push(4, "expense", BASE_MONTHLY.utilities, "c10", "a1", "Utilities Bill");
  push(5, "expense", BASE_MONTHLY.internet, "c11", "a1", "Internet & Mobile");
  push(2, "expense", BASE_MONTHLY.insurance, "c12", "a1", "Health Insurance");
  push(6, "expense", BASE_MONTHLY.subscriptions, "c13", "a1", "Streaming Subscriptions");

  // --- Expenses (Checking) ---
  push(8, "expense", BASE_MONTHLY.groceries, "c14", "a1", "Groceries");
  push(12, "expense", BASE_MONTHLY.dining, "c15", "a1", "Dining Out");
  push(3, "expense", BASE_MONTHLY.transport, "c16", "a1", "Transportation");
  push(14, "expense", BASE_MONTHLY.shopping, "c17", "a1", "Shopping");
  push(18, "expense", BASE_MONTHLY.entertainment, "c18", "a1", "Entertainment");
  push(9, "expense", BASE_MONTHLY.healthcare, "c19", "a1", "Healthcare");
  push(16, "expense", BASE_MONTHLY.personal, "c20", "a1", "Personal Care");
  push(25, "expense", BASE_MONTHLY.other, "c21", "a1", "Other Expenses");

  // --- Debt payments (transfers from Checking → card/loan) ---
  push(15, "transfer", BASE_MONTHLY.creditCard, "c22", "a1", "Credit Card Payment", { toAccountId: "a4" });
  push(28, "transfer", BASE_MONTHLY.carLoan, "c23", "a1", "Car Loan Payment", { toAccountId: "a5" });

  // --- Savings transfers (Checking → Savings) ---
  push(5, "transfer", BASE_MONTHLY.emergency, "c5", "a1", "Emergency Fund Transfer", { toAccountId: "a2" });
  push(5, "transfer", BASE_MONTHLY.generalSavings, "c6", "a1", "General Savings Transfer", { toAccountId: "a2" });

  // --- Investment transfers (Checking → Investment) ---
  push(5, "transfer", BASE_MONTHLY.investments, "c7", "a1", "Investment Transfer", { toAccountId: "a3" });
  push(5, "transfer", BASE_MONTHLY.retirement, "c8", "a1", "Retirement Transfer", { toAccountId: "a3" });
}

// Append one-off transactions
for (const off of ONE_OFFS) {
  transactions.push({
    id: `tx-${txId++}`,
    date: off.date,
    accountId: off.accountId,
    categoryId: off.categoryId,
    type: off.type,
    amount: off.amount,
    description: off.description,
    status: "cleared",
    notes: off.notes,
    toAccountId: off.toAccountId,
  });
}

// ============================================================
// Accounts — currentBalance derived from transactions
// ============================================================
function accountDelta(id: string): number {
  return transactions.reduce((sum, t) => {
    let delta = 0;
    if (t.accountId === id) {
      if (t.type === "income") delta += t.amount;
      else if (t.type === "expense" || t.type === "transfer") delta -= t.amount;
    }
    if (t.toAccountId === id) delta += t.amount;
    return sum + delta;
  }, 0);
}

const ACCOUNT_META: Record<string, { name: string; type: Account["type"]; currency: string; institution: string }> = {
  a1: { name: "Checking", type: "checking", currency: "USD", institution: "Chase" },
  a2: { name: "Savings", type: "savings", currency: "USD", institution: "Chase" },
  a3: { name: "Investment", type: "investment", currency: "USD", institution: "Vanguard" },
  a4: { name: "Credit Card", type: "credit", currency: "USD", institution: "Amex" },
  a5: { name: "Car Loan", type: "loan", currency: "USD", institution: "Chase Auto" },
};

export const accounts: Account[] = ACCOUNT_OPENINGS.map((o) => {
  const meta = ACCOUNT_META[o.id];
  return {
    id: o.id,
    name: meta.name,
    type: meta.type,
    openingBalance: o.openingBalance,
    currentBalance: o.openingBalance + accountDelta(o.id),
    currency: meta.currency,
    institution: meta.institution,
    active: true,
  };
});

// ============================================================
// Budgets — 12 months × 15 expense categories
// ============================================================
const BUDGET_PLANNED: Record<string, number> = {
  c9: 1500,
  c10: 200,
  c11: 70,
  c12: 220,
  c13: 45,
  c14: 650,
  c15: 300,
  c16: 300,
  c17: 150,
  c18: 150,
  c19: 120,
  c20: 150,
  c21: 100,
  c22: 240,
  c23: 350,
};

export const budgets: Budget[] = [];
for (const month of periods[0].months) {
  for (const [categoryId, plannedAmount] of Object.entries(BUDGET_PLANNED)) {
    const actualAmount = transactions
      .filter((t) => t.categoryId === categoryId && t.date.startsWith(month))
      .reduce((sum, t) => sum + t.amount, 0);
    budgets.push({
      id: `b-${month}-${categoryId}`,
      categoryId,
      periodId: periods[0].id,
      month,
      plannedAmount,
      actualAmount,
    });
  }
}

// ============================================================
// Goals
// ============================================================
const savingsBalance = accounts.find((a) => a.type === "savings")?.currentBalance ?? 0;
const loanBalance = accounts.find((a) => a.id === "a5")?.currentBalance ?? 0;
const checkingBalance = accounts.find((a) => a.id === "a1")?.currentBalance ?? 0;
const investmentBalance = accounts.find((a) => a.id === "a3")?.currentBalance ?? 0;
const creditBalance = accounts.find((a) => a.id === "a4")?.currentBalance ?? 0;
const currentNetWorth = checkingBalance + savingsBalance + investmentBalance - Math.abs(creditBalance) - Math.abs(loanBalance);

export const goals: Goal[] = [
  {
    id: "g1",
    name: "Reach $150k net worth",
    targetAmount: 150000,
    currentAmount: currentNetWorth,
    targetDate: "2027-06-30",
    status: "on-track",
  },
  {
    id: "g2",
    name: "Pay off car loan early",
    targetAmount: 7500,
    currentAmount: Math.abs(loanBalance),
    targetDate: "2026-09-30",
    status: "on-track",
  },
  {
    id: "g3",
    name: "Build 6-month emergency fund",
    targetAmount: 25000,
    currentAmount: Math.min(savingsBalance, 25000),
    targetDate: "2026-06-30",
    status: "completed",
  },
  {
    id: "g4",
    name: "Grow retirement & investment portfolio",
    targetAmount: 40000,
    currentAmount: investmentBalance,
    targetDate: "2026-04-15",
    status: "on-track",
  },
  {
    id: "g5",
    name: "Reduce dining out by 30%",
    targetAmount: 12000,
    currentAmount: 7800,
    targetDate: "2026-06-30",
    status: "at-risk",
  },
];

// ============================================================
// Planned transactions (recurring + upcoming one-offs)
// =============================================================
export const plannedTransactions: PlannedTransaction[] = [
  // Recurring monthly — starting the month after the period ends
  { id: "p1", date: "2026-07-01", accountId: "a1", categoryId: "c9", description: "Monthly Rent", amount: 1500, type: "expense", status: "pending", recurrence: "monthly" },
  { id: "p2", date: "2026-07-01", accountId: "a1", categoryId: "c1", description: "Salary Deposit", amount: 5400, type: "income", status: "pending", recurrence: "monthly" },
  { id: "p3", date: "2026-07-08", accountId: "a1", categoryId: "c14", description: "Groceries", amount: 600, type: "expense", status: "pending", recurrence: "monthly" },
  { id: "p4", date: "2026-07-15", accountId: "a1", categoryId: "c22", description: "Credit Card Payment", amount: 240, type: "transfer", status: "pending", recurrence: "monthly", toAccountId: "a4" },
  { id: "p5", date: "2026-07-28", accountId: "a1", categoryId: "c23", description: "Car Loan Payment", amount: 350, type: "transfer", status: "pending", recurrence: "monthly", toAccountId: "a5" },
  { id: "p6", date: "2026-07-05", accountId: "a1", categoryId: "c5", description: "Emergency Fund Transfer", amount: 400, type: "transfer", status: "pending", recurrence: "monthly", toAccountId: "a2" },
  { id: "p7", date: "2026-07-05", accountId: "a1", categoryId: "c8", description: "Retirement Transfer", amount: 550, type: "transfer", status: "pending", recurrence: "monthly", toAccountId: "a3" },
  // One-offs / upcoming
  { id: "p8", date: "2026-08-08", accountId: "a1", categoryId: "c16", description: "Car Maintenance", amount: 450, type: "expense", status: "pending", recurrence: "once" },
  { id: "p9", date: "2026-09-15", accountId: "a1", categoryId: "c4", description: "Q3 Bonus", amount: 2500, type: "income", status: "pending", recurrence: "once" },
  { id: "p10", date: "2026-12-01", accountId: "a1", categoryId: "c12", description: "Renters Insurance Renewal", amount: 420, type: "expense", status: "pending", recurrence: "yearly" },
  { id: "p11", date: "2026-08-05", accountId: "a1", categoryId: "c6", description: "Vacation Fund Transfer", amount: 300, type: "transfer", status: "pending", recurrence: "once", toAccountId: "a2" },
  { id: "p12", date: "2026-07-15", accountId: "a1", categoryId: "c13", description: "Gym Membership Renewal", amount: 99, type: "expense", status: "pending", recurrence: "yearly" },
];

// ============================================================
// Dashboard todo list (seed state for Checklist widget)
// ============================================================
export const initialTodos: TodoRow[] = [
  { id: "t1", text: "Review Q3 investment portfolio", done: true },
  { id: "t2", text: "Update emergency fund allocation", done: false },
  { id: "t3", text: "File tax prepayment documentation", done: false },
  { id: "t4", text: "Reconcile credit card statements", done: true },
  { id: "t5", text: "Schedule annual insurance review", done: false },
];