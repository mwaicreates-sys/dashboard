"use client";

import { useDashboardData } from "@/lib/dashboardData";
import { formatCurrencyFull } from "@/lib/currency";
import { isRealized } from "@/lib/calculations";
import { getTransferAccountEffect } from "@/lib/transferEffect";
import { DetailHeader, MetricCard, BreakdownTable } from "@/components/details/shared";

export default function InvestmentsDetails() {
  const { accounts, displayAccounts, displayTransactions, categories, selectedPeriod } = useDashboardData();

  const investmentAccounts = displayAccounts.filter((a) => a.type === "investment");
  const start = selectedPeriod?.startDate ?? "";
  const end = selectedPeriod?.endDate ?? "";
  const investmentIds = new Set(investmentAccounts.map((a) => a.id));
  // Deposits into investments + income posted directly on an investment
  // account — the existing "Period Contributions" figure. Left exactly
  // as it was; the balance/period formulas this task must not touch.
  const investmentTx = displayTransactions.filter(
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
    Balance: formatCurrencyFull(a.currentBalance),
    Institution: a.institution ?? "—",
  }));

  const catById = new Map(categories.map((c) => [c.id, c]));

  // Traceability fix: BOTH transfer directions (money moving into
  // investments AND money moving back out), realized only — separate
  // from investmentTx above so the existing metric formula is untouched.
  const movementTx = displayTransactions
    .filter(
      (t) =>
        isRealized(t) &&
        t.type === "transfer" &&
        t.date >= start &&
        t.date <= end &&
        (investmentIds.has(t.accountId) || (t.toAccountId ? investmentIds.has(t.toAccountId) : false))
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const incomeRows = investmentTx.filter((t) => t.type === "income");

  const txRows = [...movementTx, ...incomeRows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
    .map((tx) => {
      if (tx.type === "transfer") {
        const investmentAccountId = investmentIds.has(tx.accountId) ? tx.accountId : tx.toAccountId!;
        const effect = getTransferAccountEffect(tx, investmentAccountId);
        const counterparty = effect ? accounts.find((a) => a.id === effect.counterpartyAccountId)?.name ?? "—" : "—";
        return {
          Date: tx.date,
          Description: effect?.direction === "in" ? `Transfer from ${counterparty}` : `Transfer to ${counterparty}`,
          Category: "Transfer",
          Amount: `${effect?.direction === "in" ? "+" : "−"}${formatCurrencyFull(tx.amount)}`,
          Type: "transfer",
        };
      }
      return {
        Date: tx.date,
        Description: tx.description,
        Category: catById.get(tx.categoryId)?.name ?? tx.categoryId,
        Amount: formatCurrencyFull(tx.amount),
        Type: tx.type,
      };
    });

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-surface p-3 md:p-4 shadow-sm">
        <DetailHeader title="Investment Details" subtitle="Investment accounts, contributions, and activity" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <MetricCard label="Total Invested" value={formatCurrencyFull(totalInvested)} sub={`${investmentAccounts.length} account(s)`} />
          <MetricCard label="Period Contributions" value={formatCurrencyFull(monthlyContributions)} sub="Transfers and income" />
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
