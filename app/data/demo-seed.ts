import {
  Account,
  Transaction,
  Category,
  Budget,
  Goal,
  PlannedTransaction,
  TodoRow,
  Activity,
  Notification,
  CategoryGroup,
  CategoryType,
} from "./model/types";

// ============================================================
// Demo Seed Data — Realistic Electronics Retail (Kenya)
// ============================================================
// This seed populates an EXISTING business with comprehensive
// demo data to showcase all SaaS features.
//
// Currency: KES
// Year: 2026
// ============================================================

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

export const demoCategories: Category[] = [
  // Income
  cat("dc1", "Product Sales", "income", "income", "#3B7A9E"),
  cat("dc2", "Accessories Sales", "income", "income", "#4A909B"),
  cat("dc3", "Repair Services", "income", "income", "#5B8C5A"),
  cat("dc4", "Other Income", "income", "income", "#F4B860"),
  // Savings
  cat("dc5", "Emergency Fund", "savings", "expense", "#A37AB4"),
  cat("dc6", "Business Savings", "savings", "expense", "#7B8FA1"),
  // Investments
  cat("dc7", "Equipment", "investments", "expense", "#3B7A9E"),
  cat("dc8", "Expansion", "investments", "expense", "#4A6FA5"),
  // Bills
  cat("dc9", "Rent", "bills", "expense", "#E87A5D"),
  cat("dc10", "Electricity", "bills", "expense", "#D9A05B"),
  cat("dc11", "Internet", "bills", "expense", "#6BA6A0"),
  cat("dc12", "Insurance", "bills", "expense", "#D96B82"),
  cat("dc13", "Subscriptions", "bills", "expense", "#8E9AAF"),
  // Expenses
  cat("dc14", "Stock Purchases", "expenses", "expense", "#7BAE7F"),
  cat("dc15", "Marketing", "expenses", "expense", "#E8A87C"),
  cat("dc16", "Transport", "expenses", "expense", "#4A909B"),
  cat("dc17", "Salaries", "expenses", "expense", "#D96B82"),
  cat("dc18", "Office Supplies", "expenses", "expense", "#B48EAD"),
  cat("dc19", "Utilities", "expenses", "expense", "#78C6A3"),
  cat("dc20", "Miscellaneous", "expenses", "expense", "#A3A380"),
  // Debt
  cat("dc21", "Business Loan", "debt", "expense", "#C9605E"),
  cat("dc22", "Supplier Credit", "debt", "expense", "#8D6E63"),
];

// ============================================================
// Accounts
// ============================================================
export const demoAccounts: Account[] = [
  { id: "da1", name: "M-Pesa", type: "checking", openingBalance: 45000, currentBalance: 0, currency: "KES", institution: "Safaricom", active: true },
  { id: "da2", name: "Equity Bank", type: "checking", openingBalance: 320000, currentBalance: 0, currency: "KES", institution: "Equity Bank", active: true },
  { id: "da3", name: "Cash", type: "checking", openingBalance: 15000, currentBalance: 0, currency: "KES", institution: "", active: true },
  { id: "da4", name: "Business Savings", type: "savings", openingBalance: 80000, currentBalance: 0, currency: "KES", institution: "Equity Bank", active: true },
  { id: "da5", name: "Reserve Fund", type: "savings", openingBalance: 60000, currentBalance: 0, currency: "KES", institution: "Co-operative Bank", active: true },
];

// ============================================================
// Transactions
// ============================================================
export const demoTransactions: Transaction[] = [];

let txId = 1;

function pushTx(
  date: string,
  type: Transaction["type"],
  amount: number,
  categoryId: string,
  accountId: string,
  description: string,
  extra?: { toAccountId?: string; notes?: string; status?: Transaction["status"] }
) {
  demoTransactions.push({
    id: `dtx-${txId++}`,
    date,
    accountId,
    categoryId,
    type,
    amount,
    description,
    status: extra?.status ?? "cleared",
    notes: extra?.notes,
    toAccountId: extra?.toAccountId,
    currency: "KES",
  });
}

const MONTHS_2026 = [
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
];

// Monthly recurring patterns (KES)
const BASE = {
  sales: 850000,
  accessories: 120000,
  repairs: 45000,
  rent: 95000,
  electricity: 22000,
  internet: 8500,
  insurance: 12000,
  subscriptions: 6500,
  stock: 420000,
  marketing: 55000,
  transport: 28000,
  salaries: 380000,
  office: 12000,
  misc: 15000,
  loan: 45000,
  supplierCredit: 18000,
  emergency: 25000,
  businessSavings: 30000,
  equipment: 20000,
  expansion: 15000,
};

// Variation per month to make charts interesting
const VARIATION: Record<string, number> = {
  "2026-01": 1.05,
  "2026-02": 0.95,
  "2026-03": 1.10,
  "2026-04": 1.00,
  "2026-05": 1.08,
  "2026-06": 0.92,
  "2026-07": 1.12,
  "2026-08": 1.15,
  "2026-09": 0.98,
  "2026-10": 1.05,
  "2026-11": 1.20,
  "2026-12": 1.18,
};

for (const month of MONTHS_2026) {
  const v = VARIATION[month] ?? 1;
  const [year, m] = month.split("-").map(Number);
  const daysInMonth = new Date(year, m, 0).getDate();

  const d = (day: number) => Math.min(day, daysInMonth);

  // --- Income ---
  pushTx(`${month}-${d(5)}`, "income", Math.round(BASE.sales * v), "dc1", "da2", "Daily Sales Revenue", { notes: "Electronics sales" });
  pushTx(`${month}-${d(12)}`, "income", Math.round(BASE.accessories * v), "dc2", "da2", "Accessories Sales", { notes: "Phone cases, chargers" });
  pushTx(`${month}-${d(18)}`, "income", Math.round(BASE.repairs * v), "dc3", "da1", "Repair Services", { notes: "Phone/laptop repairs" });

  // --- Stock purchases (expense from Equity) ---
  pushTx(`${month}-${d(3)}`, "expense", Math.round(BASE.stock * v), "dc14", "da2", "Stock Purchase — Phones", { notes: "Bulk phone inventory" });

  // --- Bills ---
  pushTx(`${month}-${d(1)}`, "expense", BASE.rent, "dc9", "da2", "Shop Rent", { notes: "Monthly shop rent" });
  pushTx(`${month}-${d(7)}`, "expense", BASE.electricity, "dc10", "da1", "KPLC Bill", { notes: "Electricity" });
  pushTx(`${month}-${d(8)}`, "expense", BASE.internet, "dc11", "da2", "Fiber Internet", { notes: "Starlink/Zuku" });
  pushTx(`${month}-${d(10)}`, "expense", BASE.insurance, "dc12", "da2", "Business Insurance", { notes: "Fire/theft cover" });
  pushTx(`${month}-${d(15)}`, "expense", BASE.subscriptions, "dc13", "da1", "Software Subscriptions", { notes: "POS, inventory tools" });

  // --- Expenses ---
  pushTx(`${month}-${d(5)}`, "expense", Math.round(BASE.marketing * v), "dc15", "da1", "Social Media Ads", { notes: "Facebook/IG ads" });
  pushTx(`${month}-${d(20)}`, "expense", BASE.transport, "dc16", "da1", "Delivery & Fuel", { notes: "Boda boda, fuel" });
  pushTx(`${month}-${d(25)}`, "expense", BASE.salaries, "dc17", "da2", "Staff Salaries", { notes: "5 employees" });
  pushTx(`${month}-${d(12)}`, "expense", BASE.office, "dc18", "da3", "Office Supplies", { notes: "Paper, toner, etc." });
  pushTx(`${month}-${d(22)}`, "expense", BASE.misc, "dc20", "da1", "Miscellaneous", { notes: "Unexpected small costs" });

  // --- Savings transfers ---
  pushTx(`${month}-${d(26)}`, "transfer", BASE.emergency, "dc5", "da2", "Emergency Fund Transfer", { toAccountId: "da4", notes: "Monthly savings" });
  pushTx(`${month}-${d(27)}`, "transfer", BASE.businessSavings, "dc6", "da2", "Business Savings Transfer", { toAccountId: "da4", notes: "Capital reserve" });
}

// One-off transactions for realism
const ONE_OFFS: Array<{
  date: string;
  type: Transaction["type"];
  amount: number;
  categoryId: string;
  accountId: string;
  description: string;
  notes?: string;
  toAccountId?: string;
}> = [
  { date: "2026-01-15", type: "expense", amount: 85000, categoryId: "dc14", accountId: "da2", description: "New Year Stock Restock", notes: "iPhone 12 bulk order" },
  { date: "2026-02-10", type: "income", amount: 150000, categoryId: "dc1", accountId: "da2", description: "Bulk Corporate Order", notes: "Safaricom accessories order" },
  { date: "2026-04-20", type: "income", amount: 200000, categoryId: "dc1", accountId: "da2", description: "Laptop Sales Campaign", notes: "End-of-month promo" },
  { date: "2026-06-15", type: "income", amount: 180000, categoryId: "dc2", accountId: "da2", description: "Accessories Wholesale", notes: "Bulk order from distributor" },
  { date: "2026-08-12", type: "income", amount: 300000, categoryId: "dc1", accountId: "da2", description: "Back-to-School Sales", notes: "Laptops and tablets" },
  { date: "2026-10-10", type: "income", amount: 220000, categoryId: "dc3", accountId: "da1", description: "Corporate Repair Contract", notes: "Safaricom device repair" },
  { date: "2026-12-05", type: "income", amount: 450000, categoryId: "dc1", accountId: "da2", description: "Holiday Season Sales", notes: "December peak" },
  { date: "2026-12-20", type: "expense", amount: 85000, categoryId: "dc14", accountId: "da2", description: "Year-End Stock Clearance", notes: "Discounted clearance stock" },
];

for (const off of ONE_OFFS) {
  demoTransactions.push({
    id: `dtx-${txId++}`,
    date: off.date,
    accountId: off.accountId,
    categoryId: off.categoryId,
    type: off.type,
    amount: off.amount,
    description: off.description,
    status: "cleared",
    notes: off.notes,
    toAccountId: off.toAccountId,
    currency: "KES",
  });
}

// Account balances are a derived result of the seeded ledger, not placeholder
// presentation values. Transfers affect both their source and destination.
for (const account of demoAccounts) {
  let balance = account.openingBalance;
  for (const transaction of demoTransactions) {
    if (transaction.accountId === account.id) {
      balance += transaction.type === "income" ? transaction.amount : -transaction.amount;
    }
    if (transaction.type === "transfer" && transaction.toAccountId === account.id) {
      balance += transaction.amount;
    }
  }
  account.currentBalance = balance;
}

// ============================================================
// Budgets (monthly, 2026)
// ============================================================
export const demoBudgets: Budget[] = [];

const BUDGET_PLANNED: Record<string, number> = {
  dc9: 95000,
  dc10: 25000,
  dc11: 9000,
  dc12: 12000,
  dc13: 7000,
  dc14: 450000,
  dc15: 60000,
  dc16: 35000,
  dc17: 400000,
  dc18: 15000,
  dc20: 20000,
  dc21: 45000,
  dc22: 20000,
};

for (const month of MONTHS_2026) {
  for (const [categoryId, plannedAmount] of Object.entries(BUDGET_PLANNED)) {
    const actualAmount = demoTransactions
      .filter((t) => t.categoryId === categoryId && t.date.startsWith(month))
      .reduce((sum, t) => sum + t.amount, 0);
    demoBudgets.push({
      id: `db-${month}-${categoryId}`,
      categoryId,
      periodId: "2026",
      month,
      plannedAmount,
      actualAmount,
    });
  }
}

// ============================================================
// Goals
// ============================================================
const totalIncome = demoTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);

export const demoGoals: Goal[] = [
  {
    id: "dg1",
    name: "Emergency Fund",
    targetAmount: 200000,
    currentAmount: 120000,
    targetDate: "2026-12-31",
    status: "on-track",
    currency: "KES",
  },
  {
    id: "dg2",
    name: "New Shop Equipment",
    targetAmount: 150000,
    currentAmount: 85000,
    targetDate: "2026-12-31",
    status: "on-track",
    currency: "KES",
  },
  {
    id: "dg3",
    name: "2026 Revenue Target",
    targetAmount: 5000000,
    currentAmount: totalIncome,
    targetDate: "2026-12-31",
    status: "on-track",
    currency: "KES",
  },
  {
    id: "dg4",
    name: "New Point-of-Sale System",
    targetAmount: 180000,
    currentAmount: 54000,
    targetDate: "2026-10-31",
    status: "active",
    currency: "KES",
  },
  {
    id: "dg5",
    name: "Delivery Van Deposit",
    targetAmount: 500000,
    currentAmount: 450000,
    targetDate: "2026-09-30",
    status: "on-track",
    currency: "KES",
  },
];

// ============================================================
// Planned Transactions (recurring / upcoming)
// ============================================================
export const demoPlannedTransactions: PlannedTransaction[] = [
  { id: "dp1", date: "2026-07-01", accountId: "da2", categoryId: "dc9", description: "Monthly Rent", amount: 95000, type: "expense", status: "pending", recurrence: "monthly" },
  { id: "dp2", date: "2026-07-05", accountId: "da2", categoryId: "dc1", description: "Expected Sales Revenue", amount: 900000, type: "income", status: "pending", recurrence: "monthly" },
  { id: "dp3", date: "2026-07-08", accountId: "da2", categoryId: "dc14", description: "Stock Reorder", amount: 400000, type: "expense", status: "pending", recurrence: "monthly" },
  { id: "dp4", date: "2026-07-10", accountId: "da2", categoryId: "dc10", description: "Electricity Bill", amount: 22000, type: "expense", status: "pending", recurrence: "monthly" },
  { id: "dp5", date: "2026-07-10", accountId: "da2", categoryId: "dc11", description: "Internet Bill", amount: 8500, type: "expense", status: "pending", recurrence: "monthly" },
  { id: "dp6", date: "2026-07-12", accountId: "da2", categoryId: "dc17", description: "Staff Salaries", amount: 380000, type: "expense", status: "pending", recurrence: "monthly" },
  { id: "dp7", date: "2026-07-15", accountId: "da2", categoryId: "dc15", description: "Marketing Spend", amount: 55000, type: "expense", status: "pending", recurrence: "monthly" },
  { id: "dp8", date: "2026-07-15", accountId: "da2", categoryId: "dc21", description: "Business Loan Repayment", amount: 45000, type: "expense", status: "pending", recurrence: "monthly" },
  { id: "dp9", date: "2026-07-28", accountId: "da2", categoryId: "dc16", description: "Transport Costs", amount: 28000, type: "expense", status: "pending", recurrence: "monthly" },
  { id: "dp10", date: "2026-08-01", accountId: "da2", categoryId: "dc13", description: "Software Renewal", amount: 6500, type: "expense", status: "pending", recurrence: "yearly" },
  { id: "dp11", date: "2026-09-01", accountId: "da2", categoryId: "dc12", description: "Insurance Renewal", amount: 12000, type: "expense", status: "pending", recurrence: "yearly" },
  { id: "dp12", date: "2026-12-01", accountId: "da2", categoryId: "dc22", description: "Supplier Payment", amount: 18000, type: "expense", status: "pending", recurrence: "monthly" },
];

// ============================================================
// Activities
// ============================================================
export const demoActivities: Activity[] = [
  { id: "da1", title: "Entry created", date: "2026-01-05", status: "completed", notes: "Daily sales revenue recorded", dueDate: "2026-01-05", priority: "high", completedAt: "2026-01-05T08:30:00Z" },
  { id: "da2", title: "Stock purchased", date: "2026-01-03", status: "completed", notes: "Bulk phone inventory from distributor", dueDate: "2026-01-03", priority: "high", completedAt: "2026-01-03T10:00:00Z" },
  { id: "da3", title: "Entry edited", date: "2026-01-10", status: "completed", notes: "Corrected sales amount", dueDate: "2026-01-10", priority: "medium", completedAt: "2026-01-10T14:00:00Z" },
  { id: "da4", title: "Goal created", date: "2026-01-15", status: "completed", notes: "Emergency fund target set", dueDate: "2026-01-15", priority: "medium", completedAt: "2026-01-15T09:00:00Z" },
  { id: "da5", title: "Budget updated", date: "2026-01-20", status: "completed", notes: "Adjusted marketing budget for Q1", dueDate: "2026-01-20", priority: "low", completedAt: "2026-01-20T11:00:00Z" },
  { id: "da6", title: "Account created", date: "2026-02-01", status: "completed", notes: "Opened Business Savings account", dueDate: "2026-02-01", priority: "medium", completedAt: "2026-02-01T10:00:00Z" },
  { id: "da7", title: "Payment recorded", date: "2026-02-15", status: "completed", notes: "Business loan installment paid", dueDate: "2026-02-15", priority: "high", completedAt: "2026-02-15T08:00:00Z" },
  { id: "da8", title: "Recurring transaction created", date: "2026-02-20", status: "completed", notes: "Monthly salaries scheduled", dueDate: "2026-02-20", priority: "medium", completedAt: "2026-02-20T09:00:00Z" },
  { id: "da9", title: "Entry created", date: "2026-03-05", status: "completed", notes: "Corporate repair contract income", dueDate: "2026-03-05", priority: "high", completedAt: "2026-03-05T08:00:00Z" },
  { id: "da10", title: "Budget updated", date: "2026-03-15", status: "completed", notes: "Increased stock budget for Q2", dueDate: "2026-03-15", priority: "low", completedAt: "2026-03-15T11:00:00Z" },
  { id: "da11", title: "Goal created", date: "2026-04-01", status: "completed", notes: "Equipment upgrade goal set", dueDate: "2026-04-01", priority: "medium", completedAt: "2026-04-01T10:00:00Z" },
  { id: "da12", title: "Payment recorded", date: "2026-04-20", status: "completed", notes: "Insurance premium paid", dueDate: "2026-04-20", priority: "high", completedAt: "2026-04-20T08:30:00Z" },
  { id: "da13", title: "Entry edited", date: "2026-05-10", status: "completed", notes: "Updated marketing expense category", dueDate: "2026-05-10", priority: "low", completedAt: "2026-05-10T14:00:00Z" },
  { id: "da14", title: "Recurring transaction created", date: "2026-05-15", status: "completed", notes: "Monthly rent auto-payment set", dueDate: "2026-05-15", priority: "high", completedAt: "2026-05-15T09:00:00Z" },
  { id: "da15", title: "Account created", date: "2026-06-01", status: "completed", notes: "Added M-Pesa for mobile collections", dueDate: "2026-06-01", priority: "medium", completedAt: "2026-06-01T10:00:00Z" },
  { id: "da16", title: "Entry created", date: "2026-06-20", status: "completed", notes: "Holiday season stock purchase", dueDate: "2026-06-20", priority: "high", completedAt: "2026-06-20T08:00:00Z" },
  { id: "da17", title: "Goal created", date: "2026-07-01", status: "completed", notes: "2026 revenue target set", dueDate: "2026-07-01", priority: "high", completedAt: "2026-07-01T10:00:00Z" },
  { id: "da18", title: "Budget updated", date: "2026-07-15", status: "completed", notes: "Q3 budget revised upward", dueDate: "2026-07-15", priority: "medium", completedAt: "2026-07-15T11:00:00Z" },
  { id: "da19", title: "Payment recorded", date: "2026-08-01", status: "completed", notes: "Loan repayment made", dueDate: "2026-08-01", priority: "high", completedAt: "2026-08-01T08:00:00Z" },
  { id: "da20", title: "Entry created", date: "2026-09-10", status: "completed", notes: "Back-to-school campaign sales", dueDate: "2026-09-10", priority: "high", completedAt: "2026-09-10T08:00:00Z" },
];

// ============================================================
// Notifications
// ============================================================
export const demoNotifications: Notification[] = [
  { id: "dn1", title: "Budget exceeded", message: "Stock purchases exceeded budget in March 2026.", type: "budget", status: "unread", date: "2026-03-31" },
  { id: "dn2", title: "Recurring payment due", message: "Rent payment of KES 95,000 due on 2026-07-01.", type: "recurring", status: "unread", date: "2026-06-28" },
  { id: "dn3", title: "Goal milestone", message: "Emergency Fund reached 60% of target.", type: "goal", status: "read", date: "2026-06-15" },
  { id: "dn4", title: "Activity reminder", message: "Review monthly expenses for June.", type: "activity", status: "unread", date: "2026-06-30" },
  { id: "dn5", title: "Budget alert", message: "Marketing spend is approaching the monthly limit.", type: "budget", status: "read", date: "2026-07-20" },
];

// ============================================================
// Todos
// ============================================================
export const demoTodos: TodoRow[] = [
  { id: "dt1", text: "Reconcile M-Pesa transactions for June", done: true },
  { id: "dt2", text: "Review Q2 marketing ROI", done: false },
  { id: "dt3", text: "Update emergency fund allocation", done: false },
  { id: "dt4", text: "Plan Q3 stock orders", done: false },
  { id: "dt5", text: "File monthly tax compliance", done: true },
  { id: "dt6", text: "Negotiate supplier credit terms", done: false },
  { id: "dt7", text: "Evaluate new shop location", done: false },
];

// ============================================================
// Period config for 2026
// ============================================================
export const demoPeriod = {
  id: "2026",
  label: "2026",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  months: MONTHS_2026,
  currency: "KES",
};
