"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDashboardData } from "@/lib/dashboardData";
import type { Transaction, PlannedTransaction } from "@/data/model/types";
import { formatMoneyFull, shortDayLabel, todayISO } from "@/lib/dates";
import { DEBT_ACCOUNT_TYPES, isRealized, isSpendableAccount } from "@/lib/calculations";
import { classifyEntryKind } from "@/lib/entryClassification";
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

/**
 * The six primary recording kinds — all shown at once.
 *
 * Savings/Debt/Investments are "assetMove" cards: the card the user
 * clicked already says what's happening (money moving into savings /
 * toward debt / into investments), so the recorded transaction is always
 * a `type: "transfer"` between the chosen source account and an inferred
 * destination account (see `targetAccountTypes` in EntryForm) — never a
 * category the user has to configure, never a hidden transfer toggle.
 */
const KINDS: KindConfig[] = [
  {
    id: "income", label: "Income", groups: ["income"], defaultType: "income",
    chooseType: false, transferToggle: false, mode: "income",
    addTitle: "Add income", subtitle: "Record money you received", cta: "Add income",
  },
  {
    id: "outflow", label: "Outflow", groups: ["bills", "expenses"], defaultType: "expense",
    chooseType: false, transferToggle: false, mode: "outflow",
    addTitle: "Add outflow", subtitle: "Record money you spent", cta: "Add outflow",
  },
  {
    id: "savings", label: "Savings", groups: ["savings"], defaultType: "transfer",
    chooseType: false, transferToggle: false, mode: "assetMove",
    targetAccountTypes: ["savings"], createAccountType: "savings", moveVerb: "into", moveNoun: "Savings",
    addTitle: "Add to savings", subtitle: "Move money into savings", cta: "Add to savings",
  },
  {
    id: "debt", label: "Debt", groups: ["debt"], defaultType: "transfer",
    chooseType: false, transferToggle: false, mode: "assetMove",
    targetAccountTypes: [...DEBT_ACCOUNT_TYPES], createAccountType: "credit", moveVerb: "toward", moveNoun: "Debt",
    addTitle: "Add debt payment", subtitle: "Record a payment toward debt", cta: "Add debt payment",
  },
  {
    id: "other", label: "Other", groups: ["*"], defaultType: "expense",
    chooseType: true, transferToggle: false, mode: "other",
    addTitle: "Add other", subtitle: "Anything that doesn't fit the categories above", cta: "Add other",
  },
  {
    id: "investments", label: "Investments", groups: ["investments"], defaultType: "transfer",
    chooseType: false, transferToggle: false, mode: "assetMove",
    targetAccountTypes: ["investment"], createAccountType: "investment", moveVerb: "into", moveNoun: "Investments",
    addTitle: "Add investment", subtitle: "Move money into investments", cta: "Add investment",
  },
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
  other: { icon: OtherCatIcon, desc: "Anything else", href: "/other", chip: "bg-blue/10 text-blue" },
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
    plannedTransactions,
    selectedYear,
    updateTransaction,
    deleteTransaction,
    payPlannedTransaction,
    cancelPlannedTransaction,
  } = useDashboardData();

  const [form, setForm] = useState<{ kind: KindConfig; edit?: Transaction; editPlanned?: PlannedTransaction } | null>(null);
  // Phase 3: inline list actions (pay/cancel/mark-cleared/delete) are no
  // longer fire-and-forget — a rejected write surfaces here instead of
  // silently leaving a false "it worked" impression.
  const [actionError, setActionError] = useState<string | null>(null);
  const runAction = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save. Please try again.");
    }
  };
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

  // Structural, not Transaction-specific — also used for PlannedTransaction
  // rows below, which share the same category/account/type shape.
  // Delegates to the shared classifyEntryKind (@/lib/entryClassification)
  // so this card grid and each card's detail-view destination (/other in
  // particular) can never disagree about which transactions belong where.
  const kindForTx = (tx: Pick<Transaction, "categoryId" | "accountId" | "toAccountId" | "type">): KindConfig =>
    KINDS.find((k) => k.id === classifyEntryKind(tx, catById, accById))!;

  // Flow stats per kind from actual year transactions (one pass). Only
  // REALIZED transactions count — a pending entry has explicitly "not
  // counted yet" everywhere else in the app (Phase 2's isRealized rule);
  // these cards must agree.
  const flowStats = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const k of KINDS) map[k.id] = { total: 0, count: 0 };
    for (const tx of yearTx) {
      if (!isRealized(tx)) continue;
      const bucket = map[kindForTx(tx).id];
      if (!bucket) continue;
      bucket.count += 1;
      if (tx.type === "income") bucket.total += tx.amount;
      else if (tx.type === "expense") bucket.total += tx.amount;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearTx, categories]);

  // Current combined balance of spendable (non-allocated) accounts — the
  // Entry-page "how much can I actually still spend" figure. Deliberately
  // NOT year-filtered (a current balance has no "year" — it's a snapshot
  // right now) and, like the rest of this page's balance figures, read
  // from displayAccounts so it's safely aggregated in the active display
  // currency via the app's existing FX layer rather than naively summing
  // different currencies together.
  const spendableAccounts = useMemo(
    () => displayAccounts.filter((a) => a.active && isSpendableAccount(a)),
    [displayAccounts]
  );
  const availableBalance = useMemo(
    () => spendableAccounts.reduce((sum, a) => sum + a.currentBalance, 0),
    [spendableAccounts]
  );

  const balanceStats = useMemo<Record<string, KindStat & { netInPeriod: number }>>(() => {
    const sumByType = (types: Array<string>) =>
      displayAccounts
        .filter((a) => a.active && types.includes(a.type))
        .reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
    // A "movement" is any REALIZED transfer touching a matching-type
    // account this year, in EITHER direction (deposit or withdrawal) —
    // the previous version only ever counted deposits, so a savings
    // withdrawal silently vanished from the count. The legacy
    // type==="expense" clause stays for pre-simplified-Entry historical
    // data (savings/debt/investment entries recorded as a category-tagged
    // expense before Savings/Debt/Investments became real transfers).
    const countByAccountTypes = (types: Array<string>) =>
      yearTx.filter((t) => {
        if (!isRealized(t)) return false;
        const to = t.toAccountId ? accById.get(t.toAccountId) : undefined;
        const on = accById.get(t.accountId);
        if (t.type === "transfer") return (!!to && types.includes(to.type)) || (!!on && types.includes(on.type));
        return t.type === "expense" && !!on && types.includes(on.type);
      }).length;
    // Net amount moved INTO matching-type accounts this year (deposits
    // minus withdrawals) — the "+$200 saved in 2026" secondary metric.
    // Deliberately separate from sumByType's current-balance figure so
    // the big number is never described by a period-scoped movement.
    const netInPeriod = (types: Array<string>) =>
      yearTx.reduce((sum, t) => {
        if (!isRealized(t) || t.type !== "transfer") return sum;
        const to = t.toAccountId ? accById.get(t.toAccountId) : undefined;
        const on = accById.get(t.accountId);
        if (to && types.includes(to.type)) sum += t.amount;
        if (on && types.includes(on.type)) sum -= t.amount;
        return sum;
      }, 0);

    return {
      income: { ...flowStat("income"), unit: "flow", netInPeriod: 0 },
      outflow: { ...flowStat("outflow"), unit: "flow", netInPeriod: 0 },
      other: { ...flowStat("other"), unit: "flow", netInPeriod: 0 },
      savings: {
        primary: sumByType(["savings"]),
        count: countByAccountTypes(["savings"]),
        netInPeriod: netInPeriod(["savings"]),
        unit: "balance",
      },
      debt: {
        primary: sumByType([...DEBT_ACCOUNT_TYPES]),
        count: countByAccountTypes([...DEBT_ACCOUNT_TYPES]),
        netInPeriod: 0, // debt's secondary metric is movement count only (see statLine)
        unit: "balance",
      },
      investments: {
        primary: sumByType(["investment"]),
        count: countByAccountTypes(["investment"]),
        netInPeriod: netInPeriod(["investment"]),
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

  /** What "earned"/"spent"/etc. this flow kind's amount represents. */
  const FLOW_VERB: Record<string, string> = { income: "earned", outflow: "spent", other: "recorded" };

  const statLine = (kindId: string): { main: string; sub: string; tertiary?: string } => {
    const stat = balanceStats[kindId];
    if (stat.unit === "balance") {
      // The big number is ALWAYS described as a current balance — never
      // replaced by a period movement count, which previously made a
      // current balance look like "the amount moved this year" (the
      // exact confusion this fix corrects). Movement detail, if any,
      // becomes a separate, visually secondary line.
      let tertiary: string | undefined;
      if (stat.count > 0) {
        if (kindId === "debt") {
          tertiary = `${stat.count} debt movement${stat.count === 1 ? "" : "s"} in ${selectedYear}`;
        } else {
          const verb = kindId === "savings" ? "saved" : "invested";
          const sign = stat.netInPeriod >= 0 ? "+" : "−";
          tertiary = `${sign}${formatMoneyFull(Math.abs(stat.netInPeriod))} ${verb} in ${selectedYear} · ${stat.count} movement${stat.count === 1 ? "" : "s"}`;
        }
      }
      return { main: formatMoneyFull(stat.primary), sub: "current balance", tertiary };
    }
    return {
      main: formatMoneyFull(stat.primary),
      sub: `${FLOW_VERB[kindId] ?? "recorded"} in ${selectedYear}`,
    };
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-3.5">
      <header>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-text">Entry</p>
        <h1 className="mt-1 text-2xl font-semibold leading-none text-primary-text sm:text-3xl md:text-4xl">
          Record money
        </h1>
        <p className="mt-1 text-xs text-secondary-text">
          Choose a category to add your first entry.
        </p>
      </header>

      {actionError ? (
        <p role="alert" className="rounded-xl border border-orange/30 bg-orange/5 px-3 py-2 text-xs font-medium text-orange">
          {actionError}
        </p>
      ) : null}

      {/* Available Balance — current spendable balance, NOT income. Visually
          distinct (a compact banner, not a clickable action card) so it
          can't be mistaken for a seventh card. */}
      <section className="rounded-xl border border-border bg-card/40 px-3 py-2.5 sm:px-3.5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-text">Available balance</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums text-primary-text sm:text-2xl">
          {formatMoneyFull(availableBalance)}
        </p>
        <p className="truncate text-[10px] text-muted-text">
          {spendableAccounts.length > 1
            ? spendableAccounts.map((a) => `${a.name} ${formatMoneyFull(a.currentBalance)}`).join(" · ")
            : "Across spendable accounts"}
        </p>
      </section>

      {/* Six compact category cards — 3-across on desktop, 2-across on small, 1 on mobile */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {KINDS.map((kind) => {
          const meta = CARD_META[kind.id];
          const Icon = meta.icon;
          const openForm = () => setForm({ kind });
          const stat = statLine(kind.id);
          return (
            <div
              key={kind.id}
              className="group relative flex min-h-[96px] flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface p-3 transition-colors duration-200 hover:border-secondary-text/40 focus-within:border-blue/60 sm:min-h-[120px] sm:p-3.5"
            >
              {/* CARD BODY = VIEW. This full-cover Link is the actual click
                  target for the whole card — the two content blocks below
                  are layered visually ON TOP of it (later in DOM order, so
                  they paint above), which without `pointer-events-none`
                  would silently swallow clicks landing on the icon/label/
                  numbers themselves (the most visually obvious, most
                  clicked part of the card) and only let clicks in the
                  empty padding around them reach the Link. Making the
                  purely-informational content pass pointer events through
                  is the fix: users can click anywhere on the visible card
                  — including directly on the numbers — and it navigates. */}
              {meta.href ? (
                <Link
                  href={meta.href}
                  aria-label={`View ${kind.label.toLowerCase()}`}
                  className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue/60"
                />
              ) : (
                <button
                  type="button"
                  onClick={openForm}
                  aria-label={`Record ${kind.label.toLowerCase()}`}
                  className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue/60"
                />
              )}

              <div className="relative flex items-center gap-2 pointer-events-none">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.chip}`}>
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </span>
                <p className="text-sm font-semibold text-primary-text">{kind.label}</p>
              </div>

              <div className="relative mt-0.5 pointer-events-none">
                <p className="truncate text-base font-semibold tabular-nums text-primary-text">
                  {stat.main}
                </p>
                <p className="truncate text-[10px] leading-tight text-muted-text">{stat.sub}</p>
                {stat.tertiary ? (
                  <p className="truncate text-[9px] leading-tight text-muted-text/70">{stat.tertiary}</p>
                ) : null}
              </div>

              <div className="relative flex items-center justify-end">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openForm();
                  }}
                  aria-label={`Add ${kind.label.toLowerCase()} entry`}
                  className="relative z-10 flex h-7 items-center gap-1.5 rounded-full bg-primary-text/[0.06] px-2.5 text-xs font-semibold text-primary-text outline-none transition-colors hover:bg-blue hover:text-white focus-visible:ring-2 focus-visible:ring-blue/60 dark:bg-white/10 dark:hover:bg-blue"
                >
                  <PlusIcon className="h-3 w-3" strokeWidth={2.6} />
                  Add
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scheduled + Recorded frames — same content width, full-width beneath the grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Scheduled */}
        <section className="rounded-2xl border border-border bg-surface">
          <div className="border-b border-light-border px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-primary-text">Scheduled</h2>
              <span className="text-[10px] text-muted-text">
                {scheduled.length} waiting · not counted yet
              </span>
            </div>
          </div>
          {scheduled.length === 0 ? (
            <p className="mx-3 mt-2 rounded-xl border border-dashed border-border bg-card/30 px-3 py-3 text-center text-[11px] text-muted-text">
              Nothing scheduled. Add planned entries from the cards above, then record them here when they arrive.
            </p>
          ) : (
            <ul className="mt-0.5 divide-y divide-light-border">
                {scheduled.map((p, i) => {
                  const overdue = p.date < today;
                  return (
                    <li
                      key={p.id}
                      className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${
                        i > 0 ? "border-t border-light-border" : ""
                      } ${overdue ? "bg-orange/[0.05]" : "bg-surface"}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const raw = plannedTransactions.find((r) => r.id === p.id) ?? p;
                          setForm({ kind: kindForTx(raw), editPlanned: raw });
                        }}
                        aria-label={`Edit scheduled ${p.description}`}
                        className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
                      >
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
                      </button>
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
                          onClick={() => void runAction(() => payPlannedTransaction(p.id))}
                          aria-label={`Record ${p.description} as paid`}
                          title="Record now"
                          className="flex h-7 items-center gap-1 rounded-lg border border-green/40 px-2 text-[10px] font-semibold text-green transition-colors hover:bg-green/10 focus-visible:ring-2 focus-visible:ring-green/50"
                        >
                          <CheckIcon className="h-3 w-3" strokeWidth={2.4} />
                          <span className="hidden sm:inline">Pay</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void runAction(() => cancelPlannedTransaction(p.id))}
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
          <section className="rounded-2xl border border-border bg-surface">
            <div className="border-b border-light-border px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-primary-text">Recorded</h2>
                <span className="text-[10px] text-muted-text">latest {recorded.length}</span>
              </div>
            </div>
            {recorded.length === 0 ? (
              <p className="mx-3 mt-2 rounded-xl border border-dashed border-border bg-card/30 px-3 py-3 text-center text-[11px] text-muted-text">
                No entries yet. Pick a category above to add your first transaction.
              </p>
            ) : (
              <ul className="divide-y divide-light-border">
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
                          onClick={() => void runAction(() => updateTransaction(tx.id, { status: "cleared" }))}
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
                        onClick={() => void runAction(() => deleteTransaction(tx.id))}
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
      </div>

      {/* Add / edit sheet */}
      {form ? (
        <EntryForm
          kind={form.kind}
          editTx={form.edit ?? null}
          editPlanned={form.editPlanned ?? null}
          onClose={() => setForm(null)}
        />
      ) : null}
    </div>
  );
}

function useMemoSorted(transactions: Transaction[]): Transaction[] {
  return [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 14);
}
