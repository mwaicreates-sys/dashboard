"use client";

import { useDashboardData } from "@/lib/dashboardData";
import { formatCurrencyFull } from "@/lib/currency";
import { isDebtAccount, isRealized } from "@/lib/calculations";
import { getTransferAccountEffect } from "@/lib/transferEffect";
import { DetailHeader, MetricCard, BreakdownTable } from "@/components/details/shared";

export default function DebtsDetails() {
  const { accounts, displayAccounts, displayTransactions, selectedPeriod, progress } = useDashboardData();

  const debtAccounts = displayAccounts.filter((a) => isDebtAccount(a));
  const debtAccountIds = new Set(debtAccounts.map((a) => a.id));
  // Payments toward debt only — the existing "Period Payments" figure.
  // Left exactly as it was; the balance/period formulas this task must
  // not touch.
  const debtTx = displayTransactions.filter((t) => t.date >= (selectedPeriod?.startDate ?? "") && t.date <= (selectedPeriod?.endDate ?? "") && (t.type === "transfer" && t.toAccountId && debtAccounts.some((a) => a.id === t.toAccountId)));

  const totalDebt = debtAccounts.reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
  const monthlyPayments = debtTx.reduce((sum, t) => sum + t.amount, 0);

  const accountRows = debtAccounts.map((a) => ({
    Account: a.name,
    "Outstanding": formatCurrencyFull(Math.abs(a.currentBalance)),
    Institution: a.institution ?? "—",
  }));

  // Traceability fix: BOTH directions (a payment reducing the balance
  // owed, or — the mirror case — a transfer OUT of a debt/credit account
  // that increases the balance owed, e.g. a cash advance), realized
  // only, separate from debtTx above so the existing metric formula is
  // untouched. Wording is explicit ("reduces"/"increases the amount
  // owed") rather than a bare +/- sign, since a raw "+" next to a debt
  // account reads as "debt went up" even when a payment made it go down.
  const movementTx = displayTransactions
    .filter(
      (t) =>
        isRealized(t) &&
        t.type === "transfer" &&
        t.date >= (selectedPeriod?.startDate ?? "") &&
        t.date <= (selectedPeriod?.endDate ?? "") &&
        (debtAccountIds.has(t.accountId) || (t.toAccountId ? debtAccountIds.has(t.toAccountId) : false))
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-surface p-3 md:p-4 shadow-sm">
        <DetailHeader title="Debt Details" subtitle="Outstanding balances, payments, and progress" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <MetricCard label="Total Debt" value={formatCurrencyFull(totalDebt)} sub={`${debtAccounts.length} account(s)`} />
          <MetricCard label="Period Payments" value={formatCurrencyFull(monthlyPayments)} sub="Debt payments this period" />
          <MetricCard label="Debt Progress" value={`${progress.find((p) => p.label.toLowerCase().includes("debt"))?.value ?? 0}%`} sub="Reduction progress" />
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Accounts</h3>
            <BreakdownTable headers={["Account", "Outstanding", "Institution"]} rows={accountRows} />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Recent Movements</h3>
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="px-2 py-1.5 font-medium text-muted-text">Date</th>
                    <th className="px-2 py-1.5 font-medium text-muted-text">Movement</th>
                    <th className="px-2 py-1.5 font-medium text-muted-text">Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {movementTx.slice(0, 20).map((tx) => {
                    // Whichever debt/credit account this transfer
                    // touches — a transfer can only involve one of them.
                    const debtAccountId = debtAccountIds.has(tx.accountId) ? tx.accountId : tx.toAccountId!;
                    const effect = getTransferAccountEffect(tx, debtAccountId);
                    if (!effect) return null;
                    const counterparty = accounts.find((a) => a.id === effect.counterpartyAccountId)?.name ?? "—";
                    // A payment INTO the debt account (direction "in")
                    // reduces the amount owed; money OUT of it (e.g. a
                    // cash advance) increases the amount owed — the
                    // opposite of what a bare "+" would suggest here.
                    const label = effect.direction === "in" ? `Payment from ${counterparty}` : `Transfer to ${counterparty}`;
                    const effectText =
                      effect.direction === "in"
                        ? `−${formatCurrencyFull(tx.amount)} owed`
                        : `+${formatCurrencyFull(tx.amount)} owed`;
                    return (
                      <tr key={tx.id} className="border-b border-light-border last:border-b-0">
                        <td className="px-2 py-1.5 tabular-nums">{tx.date}</td>
                        <td className="px-2 py-1.5">{label}</td>
                        <td className={`px-2 py-1.5 tabular-nums ${effect.direction === "in" ? "text-green-600" : "text-orange-600"}`}>
                          {effectText}
                        </td>
                      </tr>
                    );
                  })}
                  {movementTx.length === 0 ? (
                    <tr><td colSpan={3} className="px-2 py-2 text-muted-text text-center">No debt movements this period.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}