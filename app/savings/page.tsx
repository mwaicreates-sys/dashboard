"use client";

import { useDashboardData } from "@/lib/dashboardData";
import { formatCurrencyFull } from "@/lib/currency";
import { DetailHeader, MetricCard, BreakdownTable, ProgressBar } from "@/components/details/shared";

export default function SavingsDetails() {
  const { accounts, displayAccounts, displayTransactions, selectedPeriod, savingsGoal, progress } = useDashboardData();

  const savingsAccounts = displayAccounts.filter((a) => a.type === "savings");
  const savingsTx = displayTransactions.filter((t) => t.date >= (selectedPeriod?.startDate ?? "") && t.date <= (selectedPeriod?.endDate ?? "") && t.type === "transfer" && t.toAccountId && savingsAccounts.some((a) => a.id === t.toAccountId));

  const totalSaved = savingsAccounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const monthlySavings = savingsTx.reduce((sum, t) => sum + t.amount, 0);

  const rows = savingsAccounts.map((a) => ({
    Account: a.name,
    Balance: formatCurrencyFull(a.currentBalance),
    Institution: a.institution ?? "—",
  }));

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-surface p-3 md:p-4 shadow-sm">
        <DetailHeader title="Savings Details" subtitle="Savings accounts, contributions, and goals" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <MetricCard label="Total Saved" value={formatCurrencyFull(totalSaved)} sub={`${savingsAccounts.length} account(s)`} />
          <MetricCard label="Period Savings" value={formatCurrencyFull(monthlySavings)} sub="Transfers into savings this period" />
          <MetricCard label="Savings Goal" value={`${savingsGoal[0]?.value ?? 0}%`} sub="of emergency fund target" />
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Accounts</h3>
            <BreakdownTable headers={["Account", "Balance", "Institution"]} rows={rows} />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Goal Progress</h3>
            <div className="rounded border border-border bg-card p-2.5 space-y-2">
              {progress
                .filter((p) => p.label.toLowerCase().includes("savings") || p.label.toLowerCase().includes("emergency"))
                .map((p) => (
                  <div key={p.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-primary-text">{p.label}</span>
                      <span className="text-[10px] text-muted-text tabular-nums">
                        {formatCurrencyFull(p.value)} / {formatCurrencyFull(p.total)}
                      </span>
                    </div>
                    <ProgressBar value={p.value} total={p.total} />
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Recent Savings Transactions</h3>
          <div className="overflow-hidden rounded border border-border">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-2 py-1.5 font-medium text-muted-text">Date</th>
                  <th className="px-2 py-1.5 font-medium text-muted-text">Description</th>
                  <th className="px-2 py-1.5 font-medium text-muted-text">Amount</th>
                  <th className="px-2 py-1.5 font-medium text-muted-text">To Account</th>
                </tr>
              </thead>
              <tbody>
                {savingsTx.slice(0, 20).map((tx) => {
                  const toAcc = accounts.find((a) => a.id === tx.toAccountId);
                  return (
                    <tr key={tx.id} className="border-b border-light-border last:border-b-0">
                      <td className="px-2 py-1.5 tabular-nums">{tx.date}</td>
                      <td className="px-2 py-1.5">{tx.description}</td>
                      <td className="px-2 py-1.5 tabular-nums text-green-600">{formatCurrencyFull(tx.amount)}</td>
                      <td className="px-2 py-1.5">{toAcc?.name ?? tx.toAccountId}</td>
                    </tr>
                  );
                })}
                {savingsTx.length === 0 ? (
                  <tr><td colSpan={4} className="px-2 py-2 text-muted-text text-center">No savings transactions this period.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
