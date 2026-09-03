"use client";

import { useMemo } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { formatMoneyFull, shortDayLabel, todayISO, addDaysISO } from "@/lib/dates";
import { RepeatIcon, CheckIcon, XIcon } from "./icons";

const RECURRENCE_LABEL: Record<string, string> = {
  once: "One-off",
  monthly: "Monthly",
  yearly: "Yearly",
};

/**
 * Scheduled / expected entries (planned transactions) for the next 30 days.
 * These are EXPECTATIONS — they never touch balances until explicitly paid,
 * at which point a real transaction is created via the existing workflow.
 */
export function RecurringSection() {
  const { displayPlannedTransactions, categories, accounts, payPlannedTransaction, cancelPlannedTransaction } =
    useDashboardData();

  const today = todayISO();
  const horizon = addDaysISO(today, 30);

  const upcoming = useMemo(
    () =>
      [...displayPlannedTransactions]
        .filter((p) => p.status === "pending" && p.date >= today && p.date <= horizon)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [displayPlannedTransactions, today, horizon]
  );

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const accName = (id?: string) => (id ? accounts.find((a) => a.id === id)?.name : undefined);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <RepeatIcon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-primary-text">Upcoming &amp; recurring</h2>
            <p className="text-[11px] text-muted-text">Expected in the next 30 days</p>
          </div>
        </div>
        <span className="rounded-full bg-card px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-secondary-text">
          Scheduled
        </span>
      </div>

      <p className="mb-3 text-[10px] leading-relaxed text-muted-text">
        These are planned expectations — not recorded money. Paying one creates a real transaction; nothing is
        counted until then.
      </p>

      {upcoming.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/30 px-3 py-4 text-center text-[11px] text-muted-text">
          Nothing scheduled in the next 30 days. Add planned entries from the Entry tab.
        </p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                p.type === "income" ? "border-green/25 bg-green/[0.04]" : "border-border bg-card/40"
              }`}
            >
              <div className="flex h-8 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-surface text-center leading-none">
                <span className="text-[8px] uppercase tracking-wide text-muted-text">{shortDayLabel(p.date).split(",")[0]}</span>
                <span className="text-[10px] font-semibold tabular-nums text-primary-text">{p.date.slice(8)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[12px] font-medium text-primary-text">{p.description}</p>
                  {p.recurrence && p.recurrence !== "once" ? (
                    <span className="shrink-0 rounded-full bg-teal/15 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-teal">
                      {RECURRENCE_LABEL[p.recurrence]}
                    </span>
                  ) : null}
                </div>
                <p className="text-[10px] text-muted-text">
                  {catName(p.categoryId)}
                  {accName(p.toAccountId) ? ` · to ${accName(p.toAccountId)}` : accName(p.accountId) ? ` · ${accName(p.accountId)}` : ""}
                </p>
              </div>
              <span
                className={`shrink-0 text-[12px] font-semibold tabular-nums ${
                  p.type === "income" ? "text-green" : p.type === "expense" ? "text-orange" : "text-teal"
                }`}
              >
                {p.type === "income" ? "+" : p.type === "expense" ? "−" : ""}
                {formatMoneyFull(p.amount)}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => payPlannedTransaction(p.id)}
                  aria-label={`Mark ${p.description} as paid`}
                  title="Mark as paid — records an actual transaction"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-green/40 text-green transition-colors hover:bg-green/10 focus-visible:ring-2 focus-visible:ring-green/50"
                >
                  <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  onClick={() => cancelPlannedTransaction(p.id)}
                  aria-label={`Cancel ${p.description}`}
                  title="Cancel this scheduled entry"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-text transition-colors hover:border-orange/50 hover:text-orange focus-visible:ring-2 focus-visible:ring-orange/50"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}