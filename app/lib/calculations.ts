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
import { MONTH_SHORT } from "@/lib/dates";

/**
 * "Jan".."Dec" for a "YYYY-MM" key, without going through Date parsing.
 *
 * `new Date("YYYY-MM-01")` parses as UTC midnight (no time component), so
 * `.toLocaleString(..., { month: "short" })` on it renders in the VIEWER'S
 * LOCAL timezone — for anyone west of UTC (all of the Americas), that
 * shifts the displayed label back by one month (e.g. "2026-01" rendered
 * "Dec" instead of "Jan"). Indexing the month straight out of the key
 * string is timezone-independent and always correct.
 */
function monthShortLabel(monthKey: string): string {
  return MONTH_SHORT[Number(monthKey.slice(5, 7)) - 1];
}

/**
 * The realized-transactions rule (Phase 2 financial-integrity fix).
 *
 * EntryForm's own status field tells the user "Pending · not counted yet" —
 * so every aggregate financial calculation (KPIs, charts, monthly/yearly
 * totals, budget actuals, account balances) must exclude pending
 * transactions. Transaction LISTS (Entry/history, exports' raw rows, Day
 * view) are unaffected — pending entries stay visible there with their
 * status shown; only aggregate totals filter through this predicate. Every
 * consumer of this rule must import it from here rather than re-deriving
 * its own status check, so the whole app agrees on one definition.
 */
export function isRealized(t: Pick<Transaction, "status">): boolean {
  return t.status !== "pending";
}

/**
 * The debt/liability account types (follow-up correctness fix).
 *
 * Root cause: this app's Account.type union originally listed only
 * "credit" and "loan" as liability types. Production's actual account_type
 * enum also includes "credit_card" as a DISTINCT value from "credit" (both
 * represent a liability, just created through different paths — "credit"
 * is what this app's own "Add account" dialog writes; "credit_card" exists
 * on accounts created outside that dialog, e.g. earlier imports). Every
 * debt-recognition site that checked only `type === "credit" || "loan"`
 * silently failed to recognize a real "credit_card" account as debt at
 * all — it vanished from the Debts KPI, the Debt card/detail page, net
 * worth, and the Debt entry's destination-account inference.
 *
 * This is the single source of truth every one of those sites must import
 * from, instead of re-deriving its own type list.
 */
export const DEBT_ACCOUNT_TYPES = ["credit", "credit_card", "loan"] as const;

export function isDebtAccountType(type: string): boolean {
  return (DEBT_ACCOUNT_TYPES as readonly string[]).includes(type);
}

export function isDebtAccount(account: { type: string }): boolean {
  return isDebtAccountType(account.type);
}

/**
 * The asset account types (follow-up correctness fix, same root cause as
 * DEBT_ACCOUNT_TYPES above). Production's real account_type enum has 10
 * values; this app's net-worth/asset-total code only ever recognized
 * "checking" | "savings" | "investment", so a real "cash", "bank" or
 * "mobile_money" account — all genuinely in production use — silently
 * vanished from Net Worth and the Growth page's asset totals (neither an
 * asset nor a debt, per the old allowlist).
 *
 * "other" is deliberately EXCLUDED. It has zero rows in production today,
 * is not offered by this app's own "Add account" dialog (so nothing in
 * this codebase has ever given it a meaning), and nothing about the value
 * itself signals asset vs. liability. Classifying it either way would be
 * a guess, not a fact recovered from existing semantics — per the
 * explicit instruction not to guess, an "other"-typed account is excluded
 * from both isAssetAccount and isDebtAccount, so it net-worth-neutral
 * (silently omitted) rather than silently miscounted. Revisit if/when
 * "other" gets an actual meaning (e.g. a real account is created with it,
 * or product decides what it should represent).
 */
export const ASSET_ACCOUNT_TYPES = ["cash", "bank", "mobile_money", "checking", "savings", "investment"] as const;

export function isAssetAccountType(type: string): boolean {
  return (ASSET_ACCOUNT_TYPES as readonly string[]).includes(type);
}

export function isAssetAccount(account: { type: string }): boolean {
  return isAssetAccountType(account.type);
}

/**
 * The SPENDABLE asset types (Entry-page "Available Balance" fix) — a
 * narrower subset of ASSET_ACCOUNT_TYPES. "Asset" (above) answers "does
 * this count toward Net Worth" and rightly includes savings/investment;
 * "spendable" answers a different question — "is this money the user can
 * freely spend right now, before it's been deliberately set aside" — so
 * it deliberately EXCLUDES savings and investment (money already
 * allocated elsewhere) even though both remain assets. "other" is
 * excluded for the same reason as everywhere else: no recovered meaning
 * to classify it by (see ASSET_ACCOUNT_TYPES's doc comment).
 */
export const SPENDABLE_ACCOUNT_TYPES = ["cash", "bank", "mobile_money", "checking"] as const;

export function isSpendableAccountType(type: string): boolean {
  return (SPENDABLE_ACCOUNT_TYPES as readonly string[]).includes(type);
}

export function isSpendableAccount(account: { type: string }): boolean {
  return isSpendableAccountType(account.type);
}

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
  const periodTx = transactions.filter(
    (t) => t.date >= period.startDate && t.date <= period.endDate && isRealized(t)
  );

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
    .filter((a) => isDebtAccount(a))
    .reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);

  const savingsPercentage = totalIncome > 0 ? Math.round(((totalIncome - totalOutflow) / totalIncome) * 100) : 0;
  const spentPercentage = totalIncome > 0 ? Math.round((totalOutflow / totalIncome) * 100) : 0;
  // Case-insensitive so "Retirement", "RETIREMENT" and "retirement" all
  // match consistently (Phase 2 fix). Still name-substring based — the
  // schema has no dedicated goal-category field, so a goal titled
  // differently still falls back to the placeholder target below. A real
  // fix needs a `category`/`kind` column on goals (future schema work).
  const investmentTarget = goals.find((g) => g.name.toLowerCase().includes("retirement"))?.targetAmount || 20000;
  const investmentPercentage = investmentTarget > 0 ? Math.round((investmentBalance / investmentTarget) * 100) : 0;
  // Baseline debt comes from the (converted) opening balances so the ratio
  // stays currency-consistent no matter which display currency is active.
  const originalDebt = accounts
    .filter((a) => isDebtAccount(a))
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
    const monthTx = transactions.filter((t) => t.date.startsWith(month) && isRealized(t));
    const income = monthTx.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    const outflow = monthTx.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
    const label = monthShortLabel(month);
    return { month: label, income, outflow };
  });
}

export function calculateIncomeSplit(
  transactions: Transaction[],
  categories: Category[],
  period: PeriodConfig
): DonutRow[] {
  const periodTx = transactions.filter(
    (t) => t.date >= period.startDate && t.date <= period.endDate && t.type === "income" && isRealized(t)
  );
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
  const periodTx = transactions.filter(
    (t) => t.date >= period.startDate && t.date <= period.endDate && t.type === "expense" && isRealized(t)
  );
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
    const monthTx = transactions.filter((t) => t.date.startsWith(month) && isRealized(t));
    const income = monthTx.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    const outflow = monthTx.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
    cumulative += income - outflow;
    const label = monthShortLabel(month);
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
    // Pending transactions are excluded too — "not counted yet" (isRealized).
    if (t.type === "transfer" || !isRealized(t)) continue;
    const month = t.date.slice(0, 7); // "YYYY-MM"
    if (!monthlyNet.has(month)) continue;
    const sign = t.type === "income" ? 1 : -1;
    monthlyNet.set(month, (monthlyNet.get(month) ?? 0) + sign * t.amount);
  }

  // Opening net worth at the start of the period (opening balances).
  // Explicit asset/debt classification (not "assume everything is an
  // asset unless it's debt") so this agrees with growth/page.tsx's own
  // net-worth math: an unrecognized type (e.g. "other" — see
  // ASSET_ACCOUNT_TYPES's doc comment) is excluded rather than guessed
  // into either side.
  const openingNW = accounts.reduce((sum, a) => {
    if (isDebtAccount(a)) return sum - Math.abs(a.openingBalance);
    if (isAssetAccount(a)) return sum + a.openingBalance;
    return sum;
  }, 0);

  let cumulative = 0;
  return period.months.map((month) => {
    cumulative += monthlyNet.get(month) ?? 0;
    const value = openingNW + cumulative;
    const label = monthShortLabel(month);
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
    const monthTx = transactions.filter((t) => t.date.startsWith(month) && t.type === "income" && isRealized(t));

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
    .filter((t) => t.date >= period.startDate && t.date <= period.endDate && t.type === "expense" && isRealized(t));

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
  const periodTx = transactions.filter(
    (t) => t.date >= period.startDate && t.date <= period.endDate && t.type === "expense" && isRealized(t)
  );
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

  // Case-insensitive for the same reason as the retirement match above.
  const emergencyGoal = goals.find((g) => g.name.toLowerCase().includes("emergency"));
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

