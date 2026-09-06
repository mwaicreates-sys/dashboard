"use client";

import { useMemo } from "react";
import { CircularKPI } from "@/components/CircularKPI";
import { useDashboardData } from "@/lib/dashboardData";
import { formatMoneyFull, shortDayLabel, todayISO, addDaysISO } from "@/lib/dates";
import { RecurringSection } from "./RecurringSection";

function RecordedSection() {
  const { displayTransactions, categories, accounts } = useDashboardData();

  const recent = useMemo(
    () =>
      [...displayTransactions]
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
        .slice(0, 6),
    [displayTransactions]
  );

  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name ?? "General";
  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-primary-text">Recorded</h2>
          <p className="text-[11px] text-muted-text">Latest transactions</p>
        </div>
        <span className="rounded-full bg-card px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-secondary-text">
          {recent.length} entries
        </span>
      </div>

      {recent.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/30 px-3 py-4 text-center text-[11px] text-muted-text">
          No recorded transactions yet.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {recent.map((tx) => (
            <li
              key={tx.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-card/40 px-3 py-2.5"
            >
              <div className="flex h-8 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-surface text-center leading-none">
                <span className="text-[9px] uppercase tracking-wide text-muted-text">
                  {shortDayLabel(tx.date).split(",")[0]}
                </span>
                <span className="text-[10px] font-semibold tabular-nums text-primary-text">
                  {tx.date.slice(8)}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-primary-text">{tx.description}</p>
                <p className="text-[10px] text-muted-text">
                  {categoryName(tx.categoryId)}
                  {accountName(tx.accountId) ? ` · ${accountName(tx.accountId)}` : ""}
                </p>
              </div>

              <span
                className={`shrink-0 text-right text-[12px] font-semibold tabular-nums ${
                  tx.type === "income" ? "text-green" : tx.type === "expense" ? "text-orange" : "text-teal"
                }`}
              >
                {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}
                {formatMoneyFull(tx.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DashboardTab() {
  const { kpis, displayTransactions, displayPlannedTransactions, selectedYear } = useDashboardData();

  const yearTransactions = useMemo(
    () =>
      displayTransactions.filter(
        (tx) => tx.date.startsWith(String(selectedYear))
      ),
    [displayTransactions, selectedYear]
  );

  const annualIncome = useMemo(
    () => yearTransactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0),
    [yearTransactions]
  );

  const annualOutflow = useMemo(
    () => yearTransactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0),
    [yearTransactions]
  );

  const today = todayISO();
  const horizon = addDaysISO(today, 30);

  const scheduledSoon = useMemo(
    () =>
      displayPlannedTransactions
        .filter((p) => p.status === "pending" && p.date >= today && p.date <= horizon)
        .reduce((sum, p) => sum + p.amount, 0),
    [displayPlannedTransactions, today, horizon]
  );

  const summaryCards = [
    ...kpis,
    {
      label: "Annual net",
      value: formatMoneyFull(annualIncome - annualOutflow),
      percentage: annualIncome > 0 ? Math.round(((annualIncome - annualOutflow) / annualIncome) * 100) : 0,
      color: annualIncome >= annualOutflow ? "#5B8C5A" : "#E87A5D",
    },
    {
      label: "Scheduled",
      value: formatMoneyFull(scheduledSoon),
      percentage: scheduledSoon > 0 ? 100 : 0,
      color: "#3B7A9E",
    },
  ];

  return (
    <div className="space-y-3 md:space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
            <p className="mb-2 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
              {kpi.label}
            </p>
            <div className="flex items-center justify-center">
              <CircularKPI {...kpi} />
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <RecurringSection />
        <RecordedSection />
      </section>
    </div>
  );
}