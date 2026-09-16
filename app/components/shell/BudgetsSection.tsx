"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { formatMoneyFull, todayISO } from "@/lib/dates";
import { GridIcon, PlusIcon } from "./icons";

const inputCls =
  "h-9 w-full rounded-xl border border-border bg-card px-3 text-xs text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60";

/**
 * Phase 5: budgets had full backend/provider CRUD and live actual-spend
 * calculation (respecting the Phase 2 pending-transaction exclusion
 * automatically, since recomputeBudgetActuals already filters through
 * isRealized) but zero UI to create or manage one. This is the missing
 * entry point — one month at a time (the same scope the existing
 * budget-warning notifications already use), reusing GoalsProgress's exact
 * visual pattern.
 */
export function BudgetsSection() {
  const { budgets, categories, currency, addBudget, updateBudget, deleteBudget } = useDashboardData();
  const [adding, setAdding] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const currentMonth = todayISO().slice(0, 7);
  const expenseCategories = useMemo(() => categories.filter((c) => c.type === "expense"), [categories]);
  const monthBudgets = useMemo(
    () => budgets.filter((b) => b.month === currentMonth).sort((a, b) => (a.actualAmount / (a.plannedAmount || 1)) - (b.actualAmount / (b.plannedAmount || 1))),
    [budgets, currentMonth]
  );
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const budgetedCategoryIds = useMemo(() => new Set(monthBudgets.map((b) => b.categoryId)), [monthBudgets]);
  const availableCategories = useMemo(
    () => expenseCategories.filter((c) => !budgetedCategoryIds.has(c.id)),
    [expenseCategories, budgetedCategoryIds]
  );

  const save = async () => {
    const amt = Number(amount);
    if (!categoryId || !amt || amt <= 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await addBudget({
        categoryId,
        periodId: currentMonth,
        month: currentMonth,
        plannedAmount: amt,
        actualAmount: 0,
      });
      setCategoryId("");
      setAmount("");
      setAdding(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save the budget. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (id: string, plannedAmount: number) => {
    setEditingId(id);
    setEditAmount(String(plannedAmount));
  };

  const confirmEdit = async (id: string) => {
    const amt = Number(editAmount);
    if (!amt || amt <= 0) return;
    try {
      await updateBudget(id, { plannedAmount: amt });
      setEditingId(null);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save. Please retry.");
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue/10 text-blue">
            <GridIcon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-primary-text">Budgets</h2>
            <p className="text-[11px] text-muted-text">This month&apos;s category limits</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdding((s) => !s)}
          aria-label={adding ? "Cancel adding budget" : "Add budget"}
          disabled={!adding && availableCategories.length === 0}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-secondary-text transition-colors hover:bg-surface hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60 disabled:opacity-40"
        >
          {adding ? "×" : <PlusIcon className="h-4 w-4" />}
        </button>
      </div>

      {actionError ? (
        <p role="alert" className="mb-2 text-[10px] font-medium text-orange">{actionError}</p>
      ) : null}

      {monthBudgets.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed border-border bg-card/30 px-3 py-4 text-center text-[11px] text-muted-text">
          No budgets set for this month yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {monthBudgets.map((b) => {
            const pct = b.plannedAmount > 0 ? Math.min(100, Math.round((b.actualAmount / b.plannedAmount) * 100)) : 0;
            const over = b.actualAmount > b.plannedAmount && b.plannedAmount > 0;
            return (
              <li key={b.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-primary-text">{catName(b.categoryId)}</p>
                    {editingId === b.id ? (
                      <span className="mt-0.5 flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          autoFocus
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void confirmEdit(b.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          aria-label={`Edit budget for ${catName(b.categoryId)}`}
                          className="h-6 w-24 rounded-md border border-border bg-card px-1.5 text-[11px] tabular-nums text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
                        />
                        <button type="button" onClick={() => void confirmEdit(b.id)} aria-label="Confirm budget amount" className="text-[10px] font-medium text-green">✓</button>
                        <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel edit" className="text-[10px] font-medium text-muted-text">×</button>
                      </span>
                    ) : (
                      <p className="text-[10px] tabular-nums text-muted-text">
                        {formatMoneyFull(b.actualAmount)} of {formatMoneyFull(b.plannedAmount)}
                        {over ? " · over" : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`text-[11px] font-semibold tabular-nums ${over ? "text-orange" : "text-primary-text"}`}>
                      {pct}%
                    </span>
                    {editingId === b.id ? null : (
                      <button
                        type="button"
                        onClick={() => startEdit(b.id, b.plannedAmount)}
                        aria-label={`Edit ${catName(b.categoryId)} budget`}
                        className="rounded-md px-1 text-[11px] font-medium text-blue transition-colors hover:text-blue/80"
                      >
                        edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        deleteBudget(b.id).catch((error) => {
                          setActionError(error instanceof Error ? error.message : "Could not delete the budget. Please retry.");
                        });
                      }}
                      aria-label={`Delete ${catName(b.categoryId)} budget`}
                      className="rounded-md px-1 text-[10px] text-muted-text transition-colors hover:text-orange"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border/60">
                  <div className={`h-full rounded-full transition-all duration-500 ${over ? "bg-orange" : "bg-blue"}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 rounded-xl border border-border bg-card/40 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[160px] flex-1">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Category</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-label="Budget category"
                disabled={saving}
                className={`${inputCls} h-9`}
              >
                <option value="">Select…</option>
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="w-28">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Limit · {currency}</span>
              <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" aria-label="Budget limit" disabled={saving} className={inputCls} />
            </label>
            <button type="button" onClick={() => void save()} disabled={!categoryId || !Number(amount) || saving} className="h-9 rounded-xl bg-blue px-3.5 text-xs font-medium text-white transition-colors hover:bg-blue/90 disabled:opacity-40">
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setSaveError(null); }} disabled={saving} className="h-9 rounded-xl border border-border bg-card px-3 text-xs text-secondary-text transition-colors hover:bg-surface disabled:opacity-40">
              Cancel
            </button>
          </div>
          {saveError ? <p role="alert" className="mt-2 text-[10px] font-medium text-red-600">{saveError}</p> : null}
          {availableCategories.length === 0 ? (
            <p className="mt-2 text-[10px] text-muted-text">Every expense category already has a budget this month.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
