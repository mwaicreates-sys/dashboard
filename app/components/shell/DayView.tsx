"use client";

import { useMemo, useState, FormEvent, useEffect } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import {
  relativeDayLabel,
  formatMoneyFull,
  shortDayLabel,
  todayISO,
} from "@/lib/dates";
import { XIcon, PlusIcon, NotesIcon, CheckIcon, ClockIcon } from "./icons";
import { isRealized } from "@/lib/calculations";

interface DayViewProps {
  day: string;
  onClose: () => void;
}

/**
 * Day drill-down: every real piece of information associated with one
 * calendar date — financials, transactions (with notes) and activities.
 */
export function DayView({ day, onClose }: DayViewProps) {
  const { activities, categories, displayTransactions, addActivity, updateActivity, deleteActivity, setSelectedDay } =
    useDashboardData();

  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Shared by the toggle-done and delete controls below — Phase 3: neither
  // may look successful before Supabase acknowledges it.
  const [actionError, setActionError] = useState<string | null>(null);

  // Keep global selected-day in sync so Week/Year views can highlight it.
  useEffect(() => {
    setSelectedDay(day);
    return () => setSelectedDay(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // Escape closes; body scroll locks while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const dayTx = useMemo(() => displayTransactions.filter((t) => t.date === day), [displayTransactions, day]);
  const dayActs = useMemo(() => activities.filter((a) => a.date === day), [activities, day]);

  // Phase 2 fixes: pending transactions are "not counted yet" (isRealized),
  // and a transfer between the user's own accounts is never outflow at this
  // aggregate level — matching calculations.ts's rule exactly, so this
  // summary always agrees with the dashboard KPIs for the same day.
  const income = dayTx.filter((t) => t.type === "income" && isRealized(t)).reduce((s, t) => s + t.amount, 0);
  const outflow = dayTx
    .filter((t) => t.type === "expense" && isRealized(t))
    .reduce((s, t) => s + t.amount, 0);
  const net = income - outflow;

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const catColor = (id: string) => categories.find((c) => c.id === id)?.color ?? "#999999";
  const today = todayISO();
  const isOverdue = (due?: string, status?: string) => !!due && due < today && status !== "completed";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await addActivity({ title: trimmed, date: day, status: "pending" });
      setTitle("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not save. Please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  const guardedUpdateActivity: typeof updateActivity = async (id, patch) => {
    try {
      await updateActivity(id, patch);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save. Please retry.");
    }
  };

  const guardedDeleteActivity: typeof deleteActivity = async (id) => {
    try {
      await deleteActivity(id);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete. Please retry.");
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${shortDayLabel(day)}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-sheet w-full max-w-lg rounded-t-3xl border border-border bg-surface shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-light-border px-4 pb-1 pt-4 md:px-5">
          <Header onClose={onClose} day={day} />
        </div>
        <div className="modal-body px-4 py-4 md:px-5">
          <Summary income={income} outflow={outflow} net={net} />
          <TransactionsSection dayTx={dayTx} catName={catName} catColor={catColor} />
          <ActivitiesSection
            dayActs={dayActs}
            title={title}
            setTitle={setTitle}
            submit={submit}
            submitting={submitting}
            submitError={submitError}
            updateActivity={guardedUpdateActivity}
            deleteActivity={guardedDeleteActivity}
            actionError={actionError}
            isOverdue={isOverdue}
          />
        </div>
      </div>
    </div>
  );
}

function Header({ day, onClose }: { day: string; onClose: () => void }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-text">Day</p>
        <h2 className="mt-0.5 text-2xl font-semibold leading-tight text-primary-text">
          {relativeDayLabel(day)}
        </h2>
        <p className="text-xs text-secondary-text">{shortDayLabel(day)}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close day view"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </header>
  );
}

function Summary({ income, outflow, net }: { income: number; outflow: number; net: number }) {
  return (
    <section className="grid grid-cols-3 divide-x divide-light-border rounded-2xl border border-border bg-card/40 py-2.5">
      <div className="px-2 text-center">
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-text">Income</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-green">
          {income > 0 ? "+" : ""}
          {formatMoneyFull(income)}
        </p>
      </div>
      <div className="px-2 text-center">
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-text">Outflow</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-orange">
          {outflow > 0 ? "−" : ""}
          {formatMoneyFull(outflow)}
        </p>
      </div>
      <div className="px-2 text-center">
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-text">Net</p>
        <p className={`mt-0.5 text-sm font-semibold tabular-nums ${net >= 0 ? "text-green" : "text-orange"}`}>
          {net >= 0 ? "+" : "−"}
          {formatMoneyFull(Math.abs(net))}
        </p>
      </div>
    </section>
  );
}

type Tx = ReturnType<typeof useDashboardData>["transactions"][number];
type Act = ReturnType<typeof useDashboardData>["activities"][number];

function TransactionsSection({
  dayTx,
  catName,
  catColor,
}: {
  dayTx: Tx[];
  catName: (id: string) => string;
  catColor: (id: string) => string;
}) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
        Transactions ({dayTx.length})
      </h3>
      {dayTx.length === 0 ? (
        <p className="rounded-xl border border-border bg-card/40 px-3 py-3 text-center text-[11px] text-muted-text">
          No transactions recorded on this day.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border">
          {dayTx.map((tx, i) => (
            <li key={tx.id} className={`bg-surface px-3 py-2 ${i > 0 ? "border-t border-light-border" : ""}`}>
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: catColor(tx.categoryId) }}
                  title={catName(tx.categoryId)}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-primary-text">{tx.description}</span>
                <span
                  className={`shrink-0 text-[12px] font-semibold tabular-nums ${
                    tx.type === "income" ? "text-green" : tx.type === "expense" ? "text-orange" : "text-teal"
                  }`}
                >
                  {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}
                  {formatMoneyFull(tx.amount)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 pl-4 text-[10px] text-muted-text">
                <span>{catName(tx.categoryId)}</span>
                <span>·</span>
                <span className="capitalize">{tx.status}</span>
                {tx.notes ? (
                  <span className="flex min-w-0 items-center gap-1 italic" title={tx.notes}>
                    <NotesIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{tx.notes}</span>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivitiesSection({
  dayActs,
  title,
  setTitle,
  submit,
  submitting,
  submitError,
  updateActivity,
  deleteActivity,
  actionError,
  isOverdue,
}: {
  dayActs: Act[];
  title: string;
  setTitle: (v: string) => void;
  submit: (e: FormEvent) => void;
  submitting: boolean;
  submitError: string | null;
  updateActivity: (id: string, patch: Partial<Omit<Act, "id">>) => void;
  deleteActivity: (id: string) => void;
  actionError: string | null;
  isOverdue: (due?: string, status?: string) => boolean;
}) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
        Activities ({dayActs.length})
      </h3>

      <form onSubmit={submit} className="mb-2 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add an activity for this day…"
          aria-label="New activity for this day"
          disabled={submitting}
          className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-xs text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={submitting}
          aria-label="Add activity"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue text-white transition-colors hover:bg-blue/90 focus-visible:ring-2 focus-visible:ring-blue/60 active:scale-[0.97] disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </form>
      {submitError ? <p role="alert" className="mb-2 text-[10px] font-medium text-red-600">{submitError}</p> : null}
      {actionError ? <p role="alert" className="mb-2 text-[10px] font-medium text-red-600">{actionError}</p> : null}

      {dayActs.length === 0 ? (
        <p className="rounded-xl border border-border bg-card/40 px-3 py-3 text-center text-[11px] text-muted-text">
          Nothing tracked yet for this day.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border">
          {dayActs.map((a, i) => {
            const done = a.status === "completed";
            return (
              <li key={a.id} className={`bg-surface px-3 py-2 ${i > 0 ? "border-t border-light-border" : ""}`}>
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateActivity(a.id, {
                        status: done ? "pending" : "completed",
                        completedAt: done ? undefined : new Date().toISOString(),
                      })
                    }
                    aria-label={done ? "Mark as open" : "Mark as complete"}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      done ? "border-green bg-green text-white" : "border-muted-text/50 hover:border-green"
                    }`}
                  >
                    {done ? <CheckIcon className="h-3 w-3" strokeWidth={2.5} /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`min-w-0 truncate text-[12px] ${
                          done ? "text-muted-text line-through" : "font-medium text-primary-text"
                        }`}
                      >
                        {a.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteActivity(a.id)}
                        aria-label="Delete activity"
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-muted-text transition-colors hover:bg-card hover:text-orange"
                      >
                        Delete
                      </button>
                    </div>
                    {a.notes ? <p className="mt-0.5 text-[11px] text-muted-text">{a.notes}</p> : null}
                    {a.dueDate ? (
                      <p
                        className={`mt-0.5 flex items-center gap-1 text-[10px] ${
                          isOverdue(a.dueDate, a.status) ? "font-medium text-orange" : "text-muted-text"
                        }`}
                      >
                        <ClockIcon className="h-3 w-3" />
                        {isOverdue(a.dueDate, a.status) ? `Overdue · was due ${a.dueDate}` : `Due ${a.dueDate}`}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}