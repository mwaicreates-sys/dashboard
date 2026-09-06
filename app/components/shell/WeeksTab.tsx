"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { Transaction } from "@/data/model/types";
import { getWeeksOfYear, shortDayLabel, weekRangeLabel, formatMoney, todayISO, relativeDayLabel } from "@/lib/dates";
import { ChevronDownIcon } from "./icons";
import { DayView } from "./DayView";

interface TxByDay {
  [date: string]: Transaction[];
}

interface WeekTotals {
  count: number;
  income: number;
  expense: number;
}

export function WeeksTab({
  scrollContainerRef,
}: {
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}) {
  const { selectedYear, displayTransactions, categories, activities } = useDashboardData();
  const [dayView, setDayView] = useState<string | null>(null);
  const initialWeekRef = useRef<HTMLLIElement | null>(null);
  const initialPositionedRef = useRef(false);
  const today = todayISO();

  const yearTx = useMemo(
    () =>
      displayTransactions.filter(
        (t) => t.date >= `${selectedYear}-01-01` && t.date <= `${selectedYear}-12-31`
      ),
    [displayTransactions, selectedYear]
  );

  const byDay = useMemo<TxByDay>(() => {
    const map: TxByDay = {};
    for (const tx of yearTx) {
      (map[tx.date] ??= []).push(tx);
    }
    for (const key of Object.keys(map)) map[key].sort((a, b) => b.amount - a.amount);
    return map;
  }, [yearTx]);

  const weeks = useMemo(() => getWeeksOfYear(selectedYear), [selectedYear]);

  const totals = useMemo<Record<number, WeekTotals>>(() => {
    const out: Record<number, WeekTotals> = {};
    for (const week of weeks) {
      const tot: WeekTotals = { count: 0, income: 0, expense: 0 };
      for (const day of week.days) {
        const items = byDay[day.date];
        if (!items) continue;
        for (const tx of items) {
          tot.count += 1;
          if (tx.type === "income") tot.income += tx.amount;
          else if (tx.type === "expense") tot.expense += tx.amount;
        }
      }
      out[week.weekNumber] = tot;
    }
    return out;
  }, [weeks, byDay]);

  const isCurrentYear = selectedYear === Number(today.slice(0, 4));
  const currentWeek = isCurrentYear
    ? weeks.find((week) => week.days.some((day) => day.date === today))
    : undefined;
  const initialWeek = currentWeek ?? weeks[0];
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(initialWeek ? [`w${initialWeek.weekNumber}`] : [])
  );

  useEffect(() => {
    if (initialPositionedRef.current) return;
    initialPositionedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      const container = scrollContainerRef?.current;
      const targetElement = initialWeekRef.current;
      if (!targetElement) return;
      const targetRect = targetElement.getBoundingClientRect();
      if (!container) {
        window.scrollTo({
          top: Math.max(0, window.scrollY + targetRect.top - (window.innerHeight - targetElement.offsetHeight) / 2),
          behavior: "auto",
        });
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const targetTop =
        container.scrollTop +
        targetRect.top -
        containerRect.top -
        (container.clientHeight - targetElement.offsetHeight) / 2;
      container.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollContainerRef]);

  const toggle = (weekNumber: number) => {
    const key = `w${weekNumber}`;
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const catColor = (id: string) => categories.find((c) => c.id === id)?.color ?? "#999999";

  return (
    <div className="space-y-2.5 md:space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-text">
            Weeks
          </p>
          <h1 className="mt-1 text-3xl font-semibold leading-none text-primary-text md:text-4xl">
            {selectedYear}
          </h1>
          <p className="mt-1.5 text-xs text-secondary-text">
            {weeks.length} weeks · Monday to Sunday · {yearTx.length} transactions
          </p>
        </div>
      </header>

      <div className="flex items-center gap-3 text-[10px] text-muted-text sm:gap-4">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green" /> Income
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-orange" /> Spending
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Transfers
        </span>
      </div>

      {weeks.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-xs text-muted-text">
          No weeks available for {selectedYear}.
        </p>
      ) : (
        <ol className="space-y-1.5 md:space-y-2">
          {weeks.map((week) => {
            const tot = totals[week.weekNumber];
            const isOpen = open.has(`w${week.weekNumber}`);
            const weekHasData = tot.count > 0;
            const isCurrentWeek = currentWeek?.weekNumber === week.weekNumber;
            return (
              <li
                key={week.weekNumber}
                ref={week.weekNumber === initialWeek?.weekNumber ? initialWeekRef : undefined}
                className={`overflow-hidden rounded-2xl border bg-surface ${
                  isCurrentWeek
                    ? "border-blue/60 ring-1 ring-blue/20"
                    : "border-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(week.weekNumber)}
                  aria-expanded={isOpen}
                  className="flex min-h-14 w-full items-center justify-between gap-2 px-3 py-2.5 text-left outline-none transition-colors hover:bg-card/40 focus-visible:ring-2 focus-visible:ring-blue/60 sm:gap-3 sm:px-4 sm:py-3"
                >
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <span className="flex h-8 min-w-[52px] shrink-0 items-center justify-center rounded-lg bg-card px-1.5 text-[11px] font-semibold tabular-nums text-primary-text sm:h-9 sm:min-w-[56px] sm:px-2 sm:text-xs">
                      Week {week.weekNumber}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-xs font-medium text-primary-text sm:whitespace-normal">
                        {weekRangeLabel(week.start, week.end)}
                        {isCurrentWeek ? (
                          <span className="shrink-0 rounded-full bg-blue/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-blue">
                            Current
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-[10px] text-muted-text">
                        {weekHasData
                          ? `${tot.count} transactions · ${formatMoney(tot.income)} in · ${formatMoney(tot.expense)} out`
                          : "No activity"}
                      </p>
                    </div>
                  </div>
                  <ChevronDownIcon
                    className={`h-4 w-4 shrink-0 text-muted-text transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen ? (
                  <div className="border-t border-light-border px-3 py-1.5 sm:px-4 sm:py-2">
                    {week.days.map((day) => {
                      const dayTx = byDay[day.date] ?? [];
                      const dayIncome = dayTx
                        .filter((t) => t.type === "income")
                        .reduce((s, t) => s + t.amount, 0);
                      const dayExpense = dayTx
                        .filter((t) => t.type === "expense")
                        .reduce((s, t) => s + t.amount, 0);
                      const net = dayIncome - dayExpense;
                      const dayActs = activities.filter((a) => a.date === day.date);
                      const isToday = day.date === today;
                      return (
                        <div key={day.date} className="border-b border-light-border py-1.5 last:border-b-0 sm:py-2">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setDayView(day.date)}
                              aria-label={`Open details for ${shortDayLabel(day.date, selectedYear)}`}
                              className="group flex min-w-0 flex-1 items-baseline gap-2 rounded-lg px-1 py-0.5 text-left outline-none transition-colors hover:bg-card/60 focus-visible:ring-2 focus-visible:ring-blue/60"
                            >
                              {isToday ? (
                                <span className="shrink-0 rounded-full bg-blue/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-blue">
                                  Today
                                </span>
                              ) : null}
                              <span className={`w-[92px] shrink-0 text-[11px] font-semibold ${isToday ? "text-blue" : "text-primary-text"}`}>
                                {day.label}
                              </span>
                              <span className="truncate text-[10px] tabular-nums text-muted-text">
                                {relativeDayLabel(day.date)}
                              </span>
                              {dayActs.length > 0 ? (
                                <span
                                  className="shrink-0 rounded-full bg-card px-1.5 text-[9px] font-medium text-secondary-text"
                                  title={`${dayActs.length} activit${dayActs.length === 1 ? "y" : "ies"}`}
                                >
                                  ✓{dayActs.filter((a) => a.status === "completed").length}/{dayActs.length}
                                </span>
                              ) : null}
                            </button>
                            {dayTx.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => setDayView(day.date)}
                                aria-label={`Open day details, net ${net >= 0 ? "positive" : "negative"}`}
                                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums transition-colors hover:bg-card ${
                                  net >= 0 ? "text-green" : "text-orange"
                                }`}
                              >
                                {net >= 0 ? "+" : "−"}
                                {formatMoney(Math.abs(net))}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDayView(day.date)}
                                aria-label="Open empty day"
                                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-muted-text transition-colors hover:bg-card hover:text-secondary-text"
                              >
                                Open
                              </button>
                            )}
                          </div>
                          {dayTx.length > 0 ? (
                            <ul className="mt-1.5 space-y-1">
                              {dayTx.slice(0, 4).map((tx) => (
                                <li
                                  key={tx.id}
                                  className="flex items-center gap-2 rounded-lg bg-card/50 px-2 py-1.5"
                                >
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: catColor(tx.categoryId) }}
                                  />
                                  <span className="min-w-0 flex-1 truncate text-[11px] text-primary-text">
                                    {tx.description}
                                  </span>
                                  <span
                                    className={`shrink-0 text-[11px] font-medium tabular-nums ${
                                      tx.type === "income"
                                        ? "text-green"
                                        : tx.type === "expense"
                                          ? "text-orange"
                                          : "text-teal"
                                    }`}
                                  >
                                    {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}
                                    {formatMoney(tx.amount)}
                                  </span>
                                </li>
                              ))}
                              {dayTx.length > 4 ? (
                                <li>
                                  <button
                                    type="button"
                                    onClick={() => setDayView(day.date)}
                                    className="w-full rounded-lg bg-card/30 px-2 py-1 text-left text-[10px] text-muted-text transition-colors hover:bg-card/50 hover:text-blue focus-visible:ring-2 focus-visible:ring-blue/60"
                                  >
                                    +{dayTx.length - 4} more · view day →
                                  </button>
                                </li>
                              ) : null}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {dayView ? <DayView day={dayView} onClose={() => setDayView(null)} /> : null}
    </div>
  );
}