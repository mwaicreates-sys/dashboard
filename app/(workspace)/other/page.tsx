"use client";

import { useMemo } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { formatCurrencyFull } from "@/lib/currency";
import { isRealized } from "@/lib/calculations";
import { classifyEntryKind } from "@/lib/entryClassification";
import { DetailHeader, MetricCard, BreakdownTable } from "@/components/details/shared";

/**
 * "Other" detail view — mirrors the existing Income/Outflow/Savings/
 * Debt/Investments detail pages exactly (same shared DetailHeader/
 * MetricCard/BreakdownTable primitives, same period-scoped filtering
 * convention), scoped to the SAME classification the Entry card itself
 * uses (classifyEntryKind, shared with EntryTab.tsx) so this page can
 * never show a different set of transactions than what "Other" counts.
 *
 * "Other" represents genuinely unclassifiable entries: a transaction
 * whose category cannot be matched to any of the five specific-purpose
 * groups (income/bills/expenses/savings/debt) by group or by legacy name
 * heuristic — not a general catch-all duplicating the other five cards.
 */
export default function OtherDetails() {
  const { displayTransactions, categories, accounts, selectedPeriod } = useDashboardData();

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const period = selectedPeriod;
  // Realized only (Phase 2's isRealized rule) — matches the Entry Other
  // card exactly, which only counts realized transactions in its flow
  // stat. A pending entry must not inflate this total any more than it
  // inflates the card.
  const otherTx = displayTransactions.filter(
    (t) =>
      t.date >= (period?.startDate ?? "") &&
      t.date <= (period?.endDate ?? "") &&
      isRealized(t) &&
      classifyEntryKind(t, catById, accById) === "other"
  );

  const total = otherTx.reduce((sum, t) => sum + t.amount, 0);

  const txRows = [...otherTx]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 25)
    .map((tx) => ({
      Date: tx.date,
      Description: tx.description,
      Category: categories.find((c) => c.id === tx.categoryId)?.name ?? "—",
      Account: accounts.find((a) => a.id === tx.accountId)?.name ?? tx.accountId,
      Amount: formatCurrencyFull(tx.amount),
    }));

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-surface p-3 md:p-4 shadow-sm">
        <DetailHeader title="Other Details" subtitle="Entries that don't fit Income, Outflow, Savings, Debt, or Investments" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <MetricCard label="Total" value={formatCurrencyFull(total)} sub={`${otherTx.length} entries`} />
          <MetricCard label="Recorded" value={String(otherTx.length)} sub="This period" />
        </div>

        <div className="mt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Entries</h3>
          <BreakdownTable headers={["Date", "Description", "Category", "Account", "Amount"]} rows={txRows} />
        </div>

        {otherTx.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border bg-card/30 px-3 py-4 text-center text-[11px] text-muted-text">
            Nothing here — every recorded entry currently fits Income, Outflow, Savings, Debt, or Investments.
          </p>
        ) : null}
      </div>
    </main>
  );
}
