"use client";

import { useDashboardData } from "@/lib/dashboardData";
import { DetailHeader, MetricCard, BreakdownTable } from "@/components/details/shared";

export default function DebtsDetails() {
  const { accounts, transactions, selectedPeriod, progress } = useDashboardData();

  const debtAccounts = accounts.filter((a) => a.type === "credit" || a.type === "loan");
  const debtTx = transactions.filter((t) => t.date >= (selectedPeriod?.startDate ?? "") && t.date <= (selectedPeriod?.endDate ?? "") && (t.type === "transfer" && t.toAccountId && debtAccounts.some((a) => a.id === t.toAccountId)));

  const totalDebt = debtAccounts.reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
  const monthlyPayments = debtTx.reduce((sum, t) => sum + t.amount, 0);

  const accountRows = debtAccounts.map((a) => ({
    Account: a.name,
    "Outstanding": `$${Math.abs(a.currentBalance).toLocaleString()}`,
    Institution: a.institution ?? "—",
  }));

  const txRows = debtTx.slice(0, 20).map((tx) => {
    const toAcc = accounts.find((a) => a.id === tx.toAccountId);
    return {
      Date: tx.date,
      Description: tx.description,
      "To Account": toAcc?.name ?? tx.toAccountId ?? "—",
      Payment: `$${tx.amount.toLocaleString()}`,
    };
  });

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-white p-3 md:p-4 shadow-sm">
        <DetailHeader title="Debt Details" subtitle="Outstanding balances, payments, and progress" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <MetricCard label="Total Debt" value={`$${totalDebt.toLocaleString()}`} sub={`${debtAccounts.length} account(s)`} />
          <MetricCard label="Period Payments" value={`$${monthlyPayments.toLocaleString()}`} sub="Debt payments this period" />
          <MetricCard label="Debt Progress" value={`${progress.find((p) => p.label.toLowerCase().includes("debt"))?.value ?? 0}%`} sub="Reduction progress" />
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Accounts</h3>
            <BreakdownTable headers={["Account", "Outstanding", "Institution"]} rows={accountRows} />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Recent Payments</h3>
            <BreakdownTable headers={["Date", "Description", "To Account", "Payment"]} rows={txRows} />
          </div>
        </div>
      </div>
    </main>
  );
}
