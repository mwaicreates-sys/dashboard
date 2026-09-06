import {
  Transaction,
  Account,
  Category,
  Goal,
  PeriodConfig,
  DashboardKPI,
  MonthlyBarRow,
  DonutRow,
  HeaderChartRow,
  OutflowRow,
  SpendingRow,
  ProgressRow,
} from "@/data/model/types";
import { formatCurrencyCompact } from "@/lib/currency";

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = h % 360;
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c; g = x; b = 0;
  } else if (hue < 120) {
    r = x; g = c; b = 0;
  } else if (hue < 180) {
    r = 0; g = c; b = x;
  } else if (hue < 240) {
    r = 0; g = x; b = c;
  } else if (hue < 300) {
    r = c; g = 0; b = x;
  } else {
    r = x; g = 0; b = c;
  }

  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

const DASHBOARD_CATEGORY_PALETTE = [
  "#3B7A9E",
  "#5A9F90",
  "#E87A5D",
  "#F4B860",
  "#7A9C57",
  "#D96B82",
  "#A67FD0",
  "#5BA9D1",
  "#D28A48",
  "#7CA8A2",
  "#C65D6A",
  "#6B8AC9",
];

function categoryColors(categories: Category[]): Map<string, string> {
  const assignments = new Map<string, string>();
  const used = new Set<string>();

  categories.forEach((cat, index) => {
    const nameSeed = cat.name || cat.id || `category-${index}`;
    const preferred = cat.color && cat.color.trim().length > 0 ? cat.color : "";

    let color = preferred && !used.has(preferred) ? preferred : DASHBOARD_CATEGORY_PALETTE[index % DASHBOARD_CATEGORY_PALETTE.length];
    let fallbackIndex = 0;

    while (used.has(color)) {
      const hue = (hashString(`${nameSeed}-${fallbackIndex + 1}`) + index * 47) % 360;
      const sat = 66 + (fallbackIndex % 3) * 6;
      const light = 42 + ((index + fallbackIndex) % 5) * 5;
      color = hslToHex(hue, sat, light);
      fallbackIndex += 1;
    }

    assignments.set(cat.id, color);
    used.add(color);
  });

  return assignments;
}

export function calculateKPIs(
  transactions: Transaction[],
  accounts: Account[],
  goals: Goal[],
  period: PeriodConfig
): DashboardKPI[] {
  const periodTx = transactions.filter((t) => t.date >= period.startDate && t.date <= period.endDate);

  const totalIncome = periodTx
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalOutflow = periodTx
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const savingsBalance = accounts
    .filter((a) => a.type === "savings")
    .reduce((sum, a) => sum + a.currentBalance, 0);

  const investmentBalance = accounts
    .filter((a) => a.type === "investment")
    .reduce((sum, a) => sum + a.currentBalance, 0);

  const totalDebt = accounts
    .filter((a) => a.type === "credit" || a.type === "loan")
    .reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);

  const savingsPercentage = totalIncome > 0 ? Math.round(((totalIncome - totalOutflow) / totalIncome) * 100) : 0;
  const spentPercentage = totalIncome > 0 ? Math.round((totalOutflow / totalIncome) * 100) : 0;
  const investmentTarget = goals.find((g) => g.name.includes("retirement"))?.targetAmount || 20000;
  const investmentPercentage = investmentTarget > 0 ? Math.round((investmentBalance / investmentTarget) * 100) : 0;
  // Baseline debt comes from the (converted) opening balances so the ratio
  // stays currency-consistent no matter which display currency is active.
  const originalDebt = accounts
    .filter((a) => a.type === "credit" || a.type === "loan")
    .reduce((sum, a) => sum + Math.abs(a.openingBalance), 0);
  const debtPercentage = originalDebt > 0 ? Math.round((totalDebt / originalDebt) * 100) : 0;

  return [
    { label: "Saved", value: formatCurrencyCompact(savingsBalance), percentage: savingsPercentage, color: "#5B8C5A" },
    { label: "Spent", value: formatCurrencyCompact(totalOutflow), percentage: spentPercentage, color: "#E87A5D" },
    { label: "Invested", value: formatCurrencyCompact(investmentBalance), percentage: investmentPercentage, color: "#3B7A9E" },
    { label: "Debts", value: formatCurrencyCompact(totalDebt), percentage: debtPercentage, color: "#D96B82" },
  ];
}

export function calculateMonthlyIncomeOutflow(
  transactions: Transaction[],
  period: PeriodConfig
): MonthlyBarRow[] {
  return period.months.map((month) => {
    const monthTx = transactions.filter((t) => t.date.startsWith(month));
    const income = monthTx.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    const outflow = monthTx.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
    const label = new Date(month + "-01").toLocaleString("en-US", { month: "short" });
    return { month: label, income, outflow };
  });
}

export function calculateIncomeSplit(
  transactions: Transaction[],
  categories: Category[],
  period: PeriodConfig
): DonutRow[] {
  const periodTx = transactions.filter((t) => t.date >= period.startDate && t.date <= period.endDate && t.type === "income");
  const total = periodTx.reduce((sum, t) => sum + t.amount, 0);
  const incomeCategories = categories.filter((c) => c.type === "income");
  const colors = categoryColors(incomeCategories);

  return incomeCategories.map((cat) => {
    const catTotal = periodTx.filter((t) => t.categoryId === cat.id).reduce((sum, t) => sum + t.amount, 0);
    const pct = total > 0 ? Math.round((catTotal / total) * 100) : 0;
    return { name: cat.name, value: pct, color: colors.get(cat.id) ?? cat.color };
  });
}

export function calculateOutflowTypes(
  transactions: Transaction[],
  categories: Category[],
  period: PeriodConfig
): DonutRow[] {
  const periodTx = transactions.filter((t) => t.date >= period.startDate && t.date <= period.endDate && t.type === "expense");
  const total = periodTx.reduce((sum, t) => sum + t.amount, 0);
  const expenseCategories = categories.filter((c) => c.type === "expense");
  const colors = categoryColors(expenseCategories);

  return expenseCategories.map((cat) => {
    const catTotal = periodTx.filter((t) => t.categoryId === cat.id).reduce((sum, t) => sum + t.amount, 0);
    const pct = total > 0 ? Math.round((catTotal / total) * 100) : 0;
    return { name: cat.name, value: pct, color: colors.get(cat.id) ?? cat.color };
  });
}

export function calculateCumulativeGrowth(
  transactions: Transaction[],
  period: PeriodConfig
): HeaderChartRow[] {
  let cumulative = 0;
  return period.months.map((month) => {
    const monthTx = transactions.filter((t) => t.date.startsWith(month));
    const income = monthTx.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    const outflow = monthTx.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
    cumulative += income - outflow;
    const label = new Date(month + "-01").toLocaleString("en-US", { month: "short" });
    return { month: label, value: Math.round(cumulative / 100) };
  });
}

/**
 * Real monthly net-worth growth for the selected period.
 *
 * Net worth at any point = checking + savings + investment − debt (current
 * balances). We reconstruct the month-by-month progression from:
 *   - each account's opening balance (start of period), and
 *   - the cumulative net impact of posted income/expense transactions.
 *
 * Transfers are excluded from the monthly delta because they merely move
 * money between accounts (net-zero on total net worth), so their only effect
 * on account balances is already captured via the opening→current delta.
 *
 * Returns [] when the business has NO accounts — the caller renders an empty
 * state rather than a synthetic curve. This guarantees a brand-new/empty
 * business never shows "progress" fabricated from sine-noise or another
 * business's cached values.
 */
export function calculateNetWorthGrowth(
  accounts: Account[],
  transactions: Transaction[],
  period: PeriodConfig
): HeaderChartRow[] {
  if (accounts.length === 0) return [];

  const monthlyNet = new Map<string, number>();
  for (const m of period.months) monthlyNet.set(m, 0);

  for (const t of transactions) {
    // Only income and expense move total net worth. Transfers shift money
    // between accounts and net to zero, so they are intentionally excluded.
    if (t.type === "transfer") continue;
    const month = t.date.slice(0, 7); // "YYYY-MM"
    if (!monthlyNet.has(month)) continue;
    const sign = t.type === "income" ? 1 : -1;
    monthlyNet.set(month, (monthlyNet.get(month) ?? 0) + sign * t.amount);
  }

  // Opening net worth at the start of the period (opening balances).
  const openingNW = accounts.reduce((sum, a) => {
    const bal = a.type === "credit" || a.type === "loan" ? -Math.abs(a.openingBalance) : a.openingBalance;
    return sum + bal;
  }, 0);

  let cumulative = 0;
  return period.months.map((month) => {
    cumulative += monthlyNet.get(month) ?? 0;
    const value = openingNW + cumulative;
    const label = new Date(month + "-01").toLocaleString("en-US", { month: "short" });
    return { month: label, value: Math.round(value) };
  });
}

export function calculateIncomeStreamStack(
  transactions: Transaction[],
  categories: Category[],
  period: PeriodConfig
): Record<string, Record<string, number>> {
  const incomeCategories = categories.filter((category) => category.type === "income");
  const chartKeyForCategory = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "other";

  const result: Record<string, Record<string, number>> = {};

  for (const month of period.months) {
    const monthRecord: Record<string, number> = {};
    const monthTx = transactions.filter((t) => t.date.startsWith(month) && t.type === "income");

    for (const category of incomeCategories) {
      const key = chartKeyForCategory(category.name);
      monthRecord[key] = monthTx
        .filter((t) => t.categoryId === category.id)
        .reduce((sum, t) => sum + t.amount, 0);
    }

    if (incomeCategories.length === 0) {
      result[month] = {};
      continue;
    }

    for (const tx of monthTx) {
      const category = incomeCategories.find((cat) => cat.id === tx.categoryId);
      if (!category) {
        const key = "other";
        monthRecord[key] = (monthRecord[key] ?? 0) + tx.amount;
      }
    }

    result[month] = monthRecord;
  }

  return result;
}

export function calculateTopOutflows(
  transactions: Transaction[],
  period: PeriodConfig
): OutflowRow[] {
  const periodTx = transactions
    .filter((t) => t.date >= period.startDate && t.date <= period.endDate && t.type === "expense");

  const totalsByDesc: Record<string, number> = {};
  for (const t of periodTx) {
    totalsByDesc[t.description] = (totalsByDesc[t.description] || 0) + t.amount;
  }

  const total = Object.values(totalsByDesc).reduce((sum, v) => sum + v, 0);
  return Object.entries(totalsByDesc)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, amount]) => ({
      name,
      amount: formatCurrencyCompact(amount),
      percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
    }));
}

export function calculateTopSpendings(
  transactions: Transaction[],
  categories: Category[],
  period: PeriodConfig
): SpendingRow[] {
  const periodTx = transactions.filter((t) => t.date >= period.startDate && t.date <= period.endDate && t.type === "expense");
  const categoryTotals: Record<string, number> = {};
  for (const t of periodTx) {
    categoryTotals[t.categoryId] = (categoryTotals[t.categoryId] || 0) + t.amount;
  }

  const total = periodTx.reduce((sum, t) => sum + t.amount, 0);
  return Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([catId, amount]) => {
      const cat = categories.find((c) => c.id === catId);
      return {
        name: cat?.name || catId,
        amount: formatCurrencyCompact(amount),
        percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
      };
    });
}

export function calculateProgress(goals: Goal[]): ProgressRow[] {
  return goals.map((g) => {
    return {
      label: g.name,
      value: g.currentAmount,
      total: g.targetAmount,
    };
  });
}

export function calculateSavingsGoal(accounts: Account[], goals: Goal[]): DonutRow[] {
  const savingsBalance = accounts
    .filter((a) => a.type === "savings")
    .reduce((sum, a) => sum + a.currentBalance, 0);

  const emergencyGoal = goals.find((g) => g.name.includes("emergency"));
  const target = emergencyGoal?.targetAmount || 25000;
  const saved = Math.min(savingsBalance, target);
  const remaining = Math.max(target - saved, 0);

  const savedPct = target > 0 ? Math.round((saved / target) * 100) : 0;
  const remainingPct = target > 0 ? Math.round((remaining / target) * 100) : 0;

  return [
    { name: "Saved", value: savedPct, color: "#5B8C5A" },
    { name: "Remaining", value: remainingPct, color: "#E2E0D9" },
  ];
}

