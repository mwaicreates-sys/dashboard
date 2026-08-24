"use client";

import { useDashboardData } from "@/lib/dashboardData";
import { DetailHeader, MetricCard, BreakdownTable } from "@/components/details/shared";

export default function InvestmentsDetails() {
  const { accounts, transactions, categories, selectedPeriod } = useDashboardData();

  const investmentAccounts = accounts.filter((a) => a.type === "investment");
  const start = selectedPeriod?.startDate ?? "";
  const end = selectedPeriod?.endDate ?? "";
  const investmentIds = new Set(investmentAccounts.map((a) => a.id));
  const investmentTx = transactions.filter(
    (t) =>
      t.date >= start &&
      t.date <= end &&
      ((t.type === "transfer" && t.toAccountId && investmentIds.has(t.toAccountId)) ||
        (investmentIds.has(t.accountId) && t.type === "income"))
  );

  const totalInvested = investmentAccounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const monthlyContributions = investmentTx.reduce((sum, t) => sum + t.amount, 0);

  const accountRows = investmentAccounts.map((a) => ({
    Account: a.name,
    Balance: `$${a.currentBalance.toLocaleString()}`,
    Institution: a.institution ?? "—",
  }));

  const txRows = investmentTx.slice(0, 20).map((tx) => {
    const cat = categories.find((c) => c.id === tx.categoryId);
    const toAcc = tx.toAccountId ? accounts.find((a) => a.id === tx.toAccountId) : null;
    return {
      Date: tx.date,
      Description: tx.description,
      Category: cat?.name ?? tx.categoryId,
      Amount: `$${tx.amount.toLocaleString()}`,
      Type: tx.type,
    };
  });

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-white p-3 md:p-4 shadow-sm">
        <DetailHeader title="Investment Details" subtitle="Investment accounts, contributions, and activity" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <MetricCard label="Total Invested" value={`$${totalInvested.toLocaleString()}`} sub={`${investmentAccounts.length} account(s)`} />
          <MetricCard label="Period Contributions" value={`$${monthlyContributions.toLocaleString()}`} sub="Transfers and income" />
          <MetricCard label="Account Count" value={String(investmentAccounts.length)} sub="Active investment accounts" />
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Accounts</h3>
            <BreakdownTable headers={["Account", "Balance", "Institution"]} rows={accountRows} />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Recent Activity</h3>
            <BreakdownTable headers={["Date", "Description", "Category", "Amount", "Type"]} rows={txRows} />
          </div>
        </div>
      </div>
    </main>
  );
}
