"use client";

import { useMemo } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { MONTH_LABELS } from "@/lib/dates";
import { formatCurrencyFull } from "@/lib/currency";
import { ChevronRightIcon } from "./icons";

interface MonthSummary {
  income: number;
  expense: number;
  net: number;
  count: number;
}

export function MonthlyPerformance({ onOpenWeeks }: { onOpenWeeks?: () => void }) {
  const { displayTransactions, selectedPeriod } = useDashboardData();

  const rows = useMemo(() => {
    if (!selectedPeriod) return [];
    const monthKeys = new Set(selectedPeriod.months);
    const byMonth = new Map<string, MonthSummary>();

    for (const tx of displayTransactions) {
      const mk = tx.date.slice(0, 7);
      if (!monthKeys.has(mk)) continue;
      const d = byMonth.get(mk) ?? { income: 0, expense: 0, net: 0, count: 0 };
      d.count += 1;
      if (tx.type === "income") {
        d.income += tx.amount;
        d.net += tx.amount;
      } else if (tx.type === "expense") {
        d.expense += tx.amount;
        d.net -= tx.amount;
      }
      byMonth.set(mk, d);
    }

    return selectedPeriod.months.map((mk) => {
      const monthIndex = Number(mk.slice(5, 7)) - 1;
      return {
        key: mk,
        label: MONTH_LABELS[monthIndex],
        data: byMonth.get(mk) ?? { income: 0, expense: 0, net: 0, count: 0 },
      };
    });
  }, [displayTransactions, selectedPeriod]);

  const maxValue = Math.max(
    1,
    ...rows.map((r) => Math.max(r.data.income, r.data.expense))
  );

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 md:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-primary-text">Monthly performance</h2>
          <p className="mt-0.5 text-[11px] text-muted-text">
            Income, spending and net across {selectedPeriod?.months.length ?? 12} months
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenWeeks ? (
            <button
              type="button"
              onClick={onOpenWeeks}
              aria-label="Open weekly breakdown"
              title="Weekly breakdown — Year → Week → Day"
              className="flex h-8 items-center gap-0.5 rounded-lg border border-border bg-card px-2.5 text-[11px] font-medium text-secondary-text transition-colors hover:bg-surface hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
            >
              Weeks
              <ChevronRightIcon className="h-3 w-3" />
            </button>
          ) : null}
          <div className="flex items-center gap-3 text-[10px] text-muted-text">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue" /> Income
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-orange" /> Spending
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((row) => {
          const incomePct = Math.max(4, Math.round((row.data.income / maxValue) * 100));
          const expensePct = Math.max(4, Math.round((row.data.expense / maxValue) * 100));
          return (
            <div
              key={row.key}
              className="rounded-xl border border-border/70 bg-card/50 px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-primary-text">{row.label}</span>
                <span className="text-[10px] tabular-nums text-muted-text">
                  {row.data.count} {row.data.count === 1 ? "entry" : "entries"}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-medium tabular-nums">
                <span className="text-blue">{formatCurrencyFull(row.data.income)}</span>
                <span className="text-orange">{formatCurrencyFull(row.data.expense)}</span>
                <span className={row.data.net >= 0 ? "text-green" : "text-orange"}>
                  {row.data.net >= 0 ? "+" : "−"}
                  {formatCurrencyFull(Math.abs(Math.round(row.data.net)))}
                </span>
              </div>
              <div className="mt-2 flex h-1 gap-1 overflow-hidden rounded-full bg-border/70">
                <div
                  className="rounded-full bg-blue/80"
                  style={{ width: `${incomePct}%` }}
                  title={`Income ${formatCurrencyFull(row.data.income)}`}
                />
                <div
                  className="rounded-full bg-orange/80"
                  style={{ width: `${expensePct}%` }}
                  title={`Spending ${formatCurrencyFull(row.data.expense)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}