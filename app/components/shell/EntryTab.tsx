"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDashboardData } from "@/lib/dashboardData";
import type { Transaction } from "@/data/model/types";
import { formatMoneyFull, shortDayLabel, todayISO } from "@/lib/dates";
import { EntryForm, type KindConfig } from "./EntryForm";
import {
  IncomeCatIcon,
  OutflowCatIcon,
  SavingsCatIcon,
  DebtCatIcon,
  OtherCatIcon,
  InvestmentsCatIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "./icons";

/** The six primary recording kinds — all shown at once. */
const KINDS: KindConfig[] = [
  { id: "income", label: "Income", groups: ["income"], defaultType: "income", chooseType: false, transferToggle: false },
  { id: "outflow", label: "Outflow", groups: ["bills", "expenses"], defaultType: "expense", chooseType: false, transferToggle: false },
  { id: "savings", label: "Savings", groups: ["savings"], defaultType: "expense", chooseType: false, transferToggle: true },
  { id: "debt", label: "Debt", groups: ["debt"], defaultType: "expense", chooseType: false, transferToggle: true },
  { id: "other", label: "Other", groups: ["*"], defaultType: "expense", chooseType: true, transferToggle: false },
  { id: "investments", label: "Investments", groups: ["investments"], defaultType: "expense", chooseType: false, transferToggle: true },
];

const CARD_META: Record<
  string,
  {
    icon: typeof IncomeCatIcon;
    desc: string;
    /** History/detail view opened by tapping the card body. */
    href?: string;
    /** Subtle category accent for the icon container. */
    chip: string;
  }
> = {
  income: { icon: IncomeCatIcon, desc: "Money received", href: "/income", chip: "bg-green/10 text-green" },
  outflow: { icon: OutflowCatIcon, desc: "Money spent", href: "/outflow", chip: "bg-orange/10 text-orange" },
  savings: { icon: SavingsCatIcon, desc: "Set aside", href: "/savings", chip: "bg-teal/10 text-teal" },
  debt: {
    icon: DebtCatIcon,
    desc: "Payments owed",
    href: "/debts",
    chip: "bg-orange/10 text-orange",
  },
  other: { icon: OtherCatIcon, desc: "Anything else", chip: "bg-blue/10 text-blue" },
  investments: {
    icon: InvestmentsCatIcon,
    desc: "Long-term growth",
    href: "/investments",
    chip: "bg-teal/10 text-teal",
  },
};

/** Per-kind summary derived from the same store that powers the dashboard. */
interface KindStat {
  /** Headline amount for the card. */
  primary: number;
  /** Sub line: entry count for flow kinds, account count for balances. */
  count: number;
  unit: "flow" | "balance";
}

/**
 * Entry — the single place money gets recorded. Cards show live totals from
 * the shared store and open either the matching detail view or the form;
 * scheduled items stay clearly separated until they are actually paid.
 */
export function EntryTab() {
  const {
    transactions,
    categories,
    accounts,
    displayTransactions,
    displayAccounts,
    displayPlannedTransactions,
    selectedYear,
    updateTransaction,
    deleteTransaction,
    payPlannedTransaction,
    cancelPlannedTransaction,
  } = useDashboardData();

  const [form, setForm] = useState<{ kind: KindConfig; edit?: Transaction } | null>(null);
  const today = todayISO();

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const accName = (id?: string) => (id ? accById.get(id)?.name : undefined);

  const yearTx = useMemo(
    () =>
      displayTransactions.filter(
        (t) => t.date >= `${selectedYear}-01-01` && t.date <= `${selectedYear}-12-31`
      ),
    [displayTransactions, selectedYear]
  );

  const kindForTx = (tx: Transaction): KindConfig => {
    const group = catById.get(tx.categoryId)?.group;
    if (group === "investments") return KINDS.find((k) => k.id === "investments")!;
    const byGroup = KINDS.find(
      (k) =>
        k.id !== "other" &&
        k.id !== "investments" &&
        tx.type === (k.defaultType === "income" ? "income" : tx.type === "transfer" ? "transfer" : "expense") &&
        group !== undefined &&
        k.groups.includes(group)
    );
    return byGroup ?? KINDS.find((k) => k.id === "other")!;
  };

  // Flow stats per kind from actual year transactions (one pass).
  const flowStats = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const k of KINDS) map[k.id] = { total: 0, count: 0 };
    for (const tx of yearTx) {
      const bucket = map[kindForTx(tx).id];
      if (!bucket) continue;
      bucket.count += 1;
      if (tx.type === "income") bucket.total += tx.amount;
      else if (tx.type === "expense") bucket.total += tx.amount;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearTx, categories]);

  const balanceStats = useMemo<Record<string, KindStat>>(() => {
    const sumByType = (types: Array<string>) =>
      displayAccounts
        .filter((a) => a.active && types.includes(a.type))
        .reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
    const countByAccountTypes = (types: Array<string>) =>
      yearTx.filter((t) => {
        const to = t.toAccountId ? accById.get(t.toAccountId) : undefined;
        const on = accById.get(t.accountId);
        return (
          (to && types.includes(to.type)) ||
          (t.type === "expense" && on && types.includes(on.type))
        );
      }).length;

    return {
      income: { ...flowStat("income"), unit: "flow" },
      outflow: { ...flowStat("outflow"), unit: "flow" },
      other: { ...flowStat("other"), unit: "flow" },
      savings: {
        primary: sumByType(["savings"]),
        count: countByAccountTypes(["savings"]),
        unit: "balance",
      },
      debt: {
        primary: sumByType(["credit", "loan"]),
        count: countByAccountTypes(["credit", "loan"]),
        unit: "balance",
      },
      investments: {
        primary: sumByType(["investment"]),
        count: countByAccountTypes(["investment"]),
        unit: "balance",
      },
    };

    function flowStat(id: string): { primary: number; count: number } {
      const s = flowStats[id] ?? { total: 0, count: 0 };
      return { primary: s.total, count: s.count };
    }
  }, [displayAccounts, flowStats, yearTx, accById]);

  const recorded = useMemoSorted(displayTransactions);
  const scheduled = displayPlannedTransactions
    .filter((p) => p.status === "pending")
    .sort((a, b) => a.date.localeCompare(b.date));

  const statLine = (kindId: string): { main: string; sub: string } => {
    const stat = balanceStats[kindId];
    if (stat.unit === "balance") {
      return {
        main: formatMoneyFull(stat.primary),
        sub:
          stat.count > 0
            ? `${stat.count} movement${stat.count === 1 ? "" : "s"} in ${selectedYear}`
            : "current balance",
      };
    }
    return {
      main: formatMoneyFull(stat.primary),
      sub: `${stat.count} ${stat.count === 1 ? "entry" : "entries"} in ${selectedYear}`,
    };
  };

  return (
    <div className="space-y-4">
      <header className="mb-4 md:mb-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-text">Entry</p>
        <h1 className="mt-1 text-[2.1rem] font-semibold leading-none text-primary-text md:text-4xl">
          Record money
        </h1>
        <p className="mt-1.5 text-xs text-secondary-text">
          Choose a category to add your first entry.
        </p>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* LEFT — Category cards */}
        <section className="w-full lg:w-[65%]">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {KINDS.map((kind) => {
              const meta = CARD_META[kind.id];
              const Icon = meta.icon;
              const openForm = () => setForm({ kind });
              const stat = statLine(kind.id);
              return (
                <div
                  key={kind.id}
                  className="group relative flex min-h-[148px] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-surface p-4 transition-colors duration-200 hover:border-secondary-text/40 focus-within:border-blue/60"
                >
                  {meta.href ? (
                    <Link
                      href={meta.href}
                      aria-label={`View ${kind.label.toLowerCase()}`}
                      className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue/60"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={openForm}
                      aria-label={`Record ${kind.label.toLowerCase()}`}
                      className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue/60"
                    />
                  )}

                  <div className="relative">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.chip}`}>
                      <Icon className="h-[20px] w-[20px]" strokeWidth={1.8} />
                    </span>
                  </div>

                  <div className="relative mt-3">
                    <p className="text-sm font-semibold text-primary-text">{kind.label}</p>
                    <p className="mt-0.5 truncate text-base font-semibold tabular-nums text-primary-text">
                      {stat.main}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-text">{stat.sub}</p>
                  </div>

                  <div className="relative mt-3 flex items-center justify-end">
                    <span
                      className="pointer-events-none absolute inset-x-[-0.75rem] bottom-[-0.75rem] h-16 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      style={{
                        background:
                          "radial-gradient(60% 80% at 85% 100%, rgba(125,125,125,0.08), transparent 70%)",
                      }}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openForm();
                      }}
                      aria-label={`Add ${kind.label.toLowerCase()} entry`}
                      className="relative z-10 flex h-8 items-center gap-1.5 rounded-full bg-primary-text/[0.06] px-3 text-xs font-semibold text-primary-text outline-none transition-colors hover:bg-blue hover:text-white focus-visible:ring-2 focus-visible:ring-blue/60 dark:bg-white/10 dark:hover:bg-blue"
                    >
                      <PlusIcon className="h-3.5 w-3.5" strokeWidth={2.6} />
                      Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* RIGHT — Sidebar: Scheduled + Recorded */}
        <aside className="w-full lg:w-[35%] lg:space-y-4">
          {/* Scheduled */}
          <section>
            <div className="mb-1.5 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-primary-text">Scheduled</h2>
              <span className="text-[10px] text-muted-text">
                {scheduled.length} waiting · not counted yet
              </span>
            </div>
            {scheduled.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-card/30 px-3 py-4 text-center text-[11px] text-muted-text">
                Nothing scheduled.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-2xl border border-border">
                {scheduled.map((p, i) => {
                  const overdue = p.date < today;
                  return (
                    <li
                      key={p.id}
                      className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${
                        i > 0 ? "border-t border-light-border" : ""
                      } ${overdue ? "bg-orange/[0.05]" : "bg-surface"}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] font-medium text-primary-text">{p.description}</span>
                          {overdue ? (
                            <span className="shrink-0 rounded-full bg-orange/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-orange">
                              Overdue
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[10px] text-muted-text">
                          {shortDayLabel(p.date)}
                          {p.recurrence && p.recurrence !== "once" ? ` · ${p.recurrence}` : " · one-off"}
                          {accName(p.toAccountId) ? ` · to ${accName(p.toAccountId)}` : ""}
                        </p>
                      </div>
                      <span
                        className={`w-20 shrink-0 text-right text-[12px] font-semibold tabular-nums ${
                          p.type === "income" ? "text-green" : p.type === "expense" ? "text-orange" : "text-teal"
                        }`}
                      >
                        {p.type === "income" ? "+" : p.type === "expense" ? "−" : ""}
                        {formatMoneyFull(p.amount)}
                      </span>
                      <span className="hidden sm:inline rounded-full bg-card px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-secondary-text">
                        Scheduled
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => payPlannedTransaction(p.id)}
                          aria-label={`Record ${p.description} as paid`}
                          title="Record now"
                          className="flex h-7 items-center gap-1 rounded-lg border border-green/40 px-2 text-[10px] font-semibold text-green transition-colors hover:bg-green/10 focus-visible:ring-2 focus-visible:ring-green/50"
                        >
                          <CheckIcon className="h-3 w-3" strokeWidth={2.4} />
                          <span className="hidden sm:inline">Pay</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelPlannedTransaction(p.id)}
                          aria-label={`Cancel ${p.description}`}
                          title="Cancel"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-text transition-colors hover:border-orange/50 hover:text-orange focus-visible:ring-2 focus-visible:ring-orange/50"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Recorded */}
          <section>
            <div className="mb-1.5 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-primary-text">Recorded</h2>
              <span className="text-[10px] text-muted-text">latest {recorded.length}</span>
            </div>
            {recorded.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-card/30 px-3 py-6 text-center text-[11px] text-muted-text">
                No entries yet. Pick a category above to add your first transaction.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-2xl border border-border">
                {recorded.map((tx, i) => {
                  const cat = catById.get(tx.categoryId);
                  return (
                    <li
                      key={tx.id}
                      className={`flex items-center gap-2.5 px-3 py-2.5 ${i > 0 ? "border-t border-light-border" : ""}`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: cat?.color ?? "#999" }}
                        title={cat?.name}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const raw = transactions.find((t) => t.id === tx.id) ?? tx;
                          setForm({ kind: kindForTx(raw), edit: raw });
                        }}
                        aria-label={`Edit ${tx.description}`}
                        className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
                      >
                        <p className="truncate text-[12px] font-medium text-primary-text">{tx.description}</p>
                        <p className="truncate text-[10px] text-muted-text">
                          {shortDayLabel(tx.date)} · {cat?.name ?? "—"}
                          {accName(tx.toAccountId) ? ` → ${accName(tx.toAccountId)}` : ""}
                          {tx.notes ? ` · ${tx.notes}` : ""}
                        </p>
                      </button>

                      {tx.status === "pending" ? (
                        <button
                          type="button"
                          onClick={() => updateTransaction(tx.id, { status: "cleared" })}
                          aria-label={`Mark ${tx.description} as cleared`}
                          className="h-7 shrink-0 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2 text-[10px] font-semibold text-amber-600 transition-colors hover:bg-amber-500/20 focus-visible:ring-2 focus-visible:ring-amber-500/50 dark:text-amber-400"
                        >
                          Pending
                        </button>
                      ) : (
                        <span
                          className={`hidden sm:inline-block shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                            tx.status === "cleared" ? "bg-green/10 text-green" : "bg-teal/10 text-teal"
                          }`}
                        >
                          ✓ {tx.status}
                        </span>
                      )}

                      <span
                        className={`w-20 shrink-0 text-right text-[12px] font-semibold tabular-nums ${
                          tx.type === "income" ? "text-green" : tx.type === "expense" ? "text-orange" : "text-teal"
                        }`}
                      >
                        {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}
                        {formatMoneyFull(tx.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteTransaction(tx.id)}
                        aria-label={`Delete ${tx.description}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-text transition-colors hover:bg-card hover:text-orange focus-visible:ring-2 focus-visible:ring-orange/50"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {/* Add / edit sheet */}
      {form ? <EntryForm kind={form.kind} editTx={form.edit ?? null} onClose={() => setForm(null)} /> : null}
    </div>
  );
}

function useMemoSorted(transactions: Transaction[]): Transaction[] {
  return [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 14);
}
