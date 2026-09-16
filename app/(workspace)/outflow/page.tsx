"use client";

import { useDashboardData } from "@/lib/dashboardData";
import { formatCurrencyFull } from "@/lib/currency";
import { isDebtAccount } from "@/lib/calculations";
import { DetailHeader, MetricCard, BreakdownTable } from "@/components/details/shared";

export default function OutflowDetails() {
  const { displayTransactions, categories, accounts, selectedPeriod, topOutflows } =
    useDashboardData();

  const period = selectedPeriod;
  const periodTx = displayTransactions.filter(
    (t) => t.date >= (period?.startDate ?? "") && t.date <= (period?.endDate ?? "") && t.type === "expense"
  );
  const transferTx = displayTransactions.filter(
    (t) => t.date >= (period?.startDate ?? "") && t.date <= (period?.endDate ?? "") && t.type === "transfer"
  );

  const totalOutflow = periodTx.reduce((sum, t) => sum + t.amount, 0);
  const debtPayments = transferTx
    .filter((t) => {
      const to = accounts.find((a) => a.id === t.toAccountId);
      return !!to && isDebtAccount(to);
    })
    .reduce((sum, t) => sum + t.amount, 0);
  const savingsInvestTransfers = transferTx
    .filter((t) => {
      const to = accounts.find((a) => a.id === t.toAccountId);
      return to?.type === "savings" || to?.type === "investment";
    })
    .reduce((sum, t) => sum + t.amount, 0);

  const byCategory: Record<string, number> = {};
  for (const t of periodTx) {
    byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + t.amount;
  }
  const categoryRows = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([catId, amount]) => {
      const cat = categories.find((c) => c.id === catId);
      return {
        Category: cat?.name ?? catId,
        Amount: formatCurrencyFull(amount),
        Share: totalOutflow > 0 ? `${Math.round((amount / totalOutflow) * 100)}%` : "0%",
      };
    });

  const txRows = [...periodTx]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 25)
    .map((tx) => ({
      Date: tx.date,
      Description: tx.description,
      Category: categories.find((c) => c.id === tx.categoryId)?.name ?? tx.categoryId,
      Amount: formatCurrencyFull(tx.amount),
    }));

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-surface p-3 md:p-4 shadow-sm">
        <DetailHeader title="Outflow Details" subtitle="Bills, expenses, and transfers out of checking" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <MetricCard label="Total Outflow" value={formatCurrencyFull(totalOutflow)} sub="Period expenses" />
          <MetricCard label="Debt Payments" value={formatCurrencyFull(debtPayments)} sub="Card + loan payments" />
          <MetricCard label="Savings/Inv Transfers" value={formatCurrencyFull(savingsInvestTransfers)} sub="Moved to savings & investments" />
          <MetricCard label="Transactions" value={String(periodTx.length)} sub="Expense entries" />
        </div>

        <div className="mt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Top Outflows</h3>
          <BreakdownTable
            headers={["Description", "Amount", "Share"]}
            rows={topOutflows.map((o) => ({ Description: o.name, Amount: o.amount, Share: `${o.percentage}%` }))}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">By Category</h3>
            <BreakdownTable headers={["Category", "Amount", "Share"]} rows={categoryRows} />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Largest Expense Transactions</h3>
            <BreakdownTable headers={["Date", "Description", "Category", "Amount"]} rows={txRows} />
          </div>
        </div>
      </div>
    </main>
  );
}
