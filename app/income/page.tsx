"use client";

import { useDashboardData } from "@/lib/dashboardData";
import { DetailHeader, MetricCard, BreakdownTable } from "@/components/details/shared";

export default function IncomeDetails() {
  const { transactions, categories, accounts, selectedPeriod, incomeSplit, monthlyIncomeOutflow } = useDashboardData();

  const period = selectedPeriod;
  const incomeTx = transactions.filter(
    (t) => t.date >= (period?.startDate ?? "") && t.date <= (period?.endDate ?? "") && t.type === "income"
  );

  const totalIncome = incomeTx.reduce((sum, t) => sum + t.amount, 0);
  const avgMonthly = monthlyIncomeOutflow.length > 0 ? Math.round(totalIncome / monthlyIncomeOutflow.length) : 0;
  const topSource = [...incomeSplit].sort((a, b) => b.value - a.value)[0];

  const byCategory: Record<string, number> = {};
  for (const t of incomeTx) {
    byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + t.amount;
  }
  const categoryRows = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([catId, amount]) => {
      const cat = categories.find((c) => c.id === catId);
      return {
        Source: cat?.name ?? catId,
        Amount: `$${amount.toLocaleString()}`,
        Share: totalIncome > 0 ? `${Math.round((amount / totalIncome) * 100)}%` : "0%",
      };
    });

  const txRows = [...incomeTx]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 25)
    .map((tx) => ({
      Date: tx.date,
      Description: tx.description,
      Category: categories.find((c) => c.id === tx.categoryId)?.name ?? tx.categoryId,
      Account: accounts.find((a) => a.id === tx.accountId)?.name ?? tx.accountId,
      Amount: `$${tx.amount.toLocaleString()}`,
    }));

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-white p-3 md:p-4 shadow-sm">
        <DetailHeader title="Income Details" subtitle="Income sources and transactions" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <MetricCard label="Total Income" value={`$${totalIncome.toLocaleString()}`} sub={`${incomeTx.length} entries`} />
          <MetricCard label="Avg Monthly" value={`$${avgMonthly.toLocaleString()}`} sub="Across the period" />
          <MetricCard label="Top Source" value={topSource?.name ?? "—"} sub={topSource ? `${topSource.value}% of income` : ""} />
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">By Source</h3>
            <BreakdownTable headers={["Source", "Amount", "Share"]} rows={categoryRows} />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Recent Income Transactions</h3>
            <BreakdownTable headers={["Date", "Description", "Category", "Amount"]} rows={txRows.slice(0, 15)} />
          </div>
        </div>
      </div>
    </main>
  );
}
