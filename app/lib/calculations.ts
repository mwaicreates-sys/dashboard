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

  return incomeCategories.map((cat) => {
    const catTotal = periodTx.filter((t) => t.categoryId === cat.id).reduce((sum, t) => sum + t.amount, 0);
    const pct = total > 0 ? Math.round((catTotal / total) * 100) : 0;
    return { name: cat.name, value: pct, color: cat.color };
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

  return expenseCategories.map((cat) => {
    const catTotal = periodTx.filter((t) => t.categoryId === cat.id).reduce((sum, t) => sum + t.amount, 0);
    const pct = total > 0 ? Math.round((catTotal / total) * 100) : 0;
    return { name: cat.name, value: pct, color: cat.color };
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

export function calculateNetWorthGrowth(accounts: Account[]): HeaderChartRow[] {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const checking = accounts.find((a) => a.type === "checking")?.currentBalance || 0;
  const savings = accounts.find((a) => a.type === "savings")?.currentBalance || 0;
  const investment = accounts.find((a) => a.type === "investment")?.currentBalance || 0;
  const debt = accounts.filter((a) => a.type === "credit" || a.type === "loan").reduce((s, a) => s + Math.abs(a.currentBalance), 0);
  const baseNetWorth = checking + savings + investment - debt;

  return months.map((month, i) => {
    const seasonal = Math.sin((i / 11) * Math.PI * 2) * 15;
    const trend = i * 8;
    const noise = Math.sin(i * 1.7) * 10 + Math.cos(i * 2.3) * 5;
    return { month, value: Math.round(baseNetWorth / 1000 + trend + seasonal + noise) };
  });
}

export function calculateIncomeStreamStack(
  transactions: Transaction[],
  categories: Category[],
  period: PeriodConfig
): Record<string, { salary: number; freelance: number; investments: number; other: number }> {
  const result: Record<string, { salary: number; freelance: number; investments: number; other: number }> = {};
  for (const month of period.months) {
    const monthTx = transactions.filter((t) => t.date.startsWith(month) && t.type === "income");
    result[month] = {
      salary: monthTx.filter((t) => t.categoryId === "c1").reduce((s, t) => s + t.amount, 0),
      freelance: monthTx.filter((t) => t.categoryId === "c2").reduce((s, t) => s + t.amount, 0),
      investments: monthTx.filter((t) => t.categoryId === "c3").reduce((s, t) => s + t.amount, 0),
      other: monthTx.filter((t) => t.categoryId === "c4").reduce((s, t) => s + t.amount, 0),
    };
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

