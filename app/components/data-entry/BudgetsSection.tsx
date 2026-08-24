"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { Budget } from "@/data/model/types";
import {
  Field,
  TextInput,
  SelectBox,
  SectionTitle,
  ActionButton,
  btnPrimary,
  btnGhost,
  Empty,
  DataTable,
  DataRow,
  DataCell,
} from "./shared";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function BudgetsSection() {
  const {
    budgets,
    transactions,
    categories,
    selectedPeriod,
    addBudget,
    updateBudget,
    deleteBudget,
  } = useDashboardData();

  const months = selectedPeriod?.months ?? [];
  const periodId = selectedPeriod?.id ?? "2025-2026";
  const [month, setMonth] = useState(months[0] ?? "");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState("");
  const [addPlanned, setAddPlanned] = useState("");

  const expenseCategories = categories.filter((c) => c.type === "expense");

  const monthBudgets = useMemo(
    () => budgets.filter((b) => b.month === month && b.periodId === periodId),
    [budgets, month, periodId]
  );

  const actualFor = (categoryId: string) =>
    transactions
      .filter((t) => t.categoryId === categoryId && t.date.startsWith(month))
      .reduce((sum, t) => sum + t.amount, 0);

  const covered = new Set(monthBudgets.map((b) => b.categoryId));
  const uncovered = expenseCategories.filter((c) => !covered.has(c.id));

  const beginEdit = (b: Budget) => {
    setEditingId(b.id);
    setDraft(String(b.plannedAmount));
  };

  const saveEdit = (b: Budget) => {
    const num = Number(draft);
    if (Number.isFinite(num) && num >= 0) {
      updateBudget(b.id, { plannedAmount: num });
    }
    setEditingId(null);
    setDraft("");
  };

  const submitAdd = () => {
    const num = Number(addPlanned);
    if (!addCategoryId || !Number.isFinite(num) || num < 0) return;
    addBudget({
      categoryId: addCategoryId,
      periodId,
      month,
      plannedAmount: num,
      actualAmount: 0,
    });
    setAddCategoryId("");
    setAddPlanned("");
    setShowAdd(false);
  };

  return (
    <div>
      <SectionTitle>Budgets — Monthly Planned vs Actual</SectionTitle>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <SelectBox
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-auto"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {new Date(m + "-01").toLocaleString("en-US", { month: "long", year: "numeric" })}
            </option>
          ))}
        </SelectBox>
        <div className="ml-auto">
          <button className={btnPrimary} onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? "Cancel" : "+ Add Budget"}
          </button>
        </div>
      </div>

      {showAdd ? (
        <div className="mb-2 space-y-1.5 rounded border border-border bg-card p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Category">
              <SelectBox value={addCategoryId} onChange={(e) => setAddCategoryId(e.target.value)}>
                <option value="">Select…</option>
                {uncovered.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </SelectBox>
            </Field>
            <Field label="Planned Amount">
              <TextInput
                type="number"
                min="0"
                step="0.01"
                value={addPlanned}
                onChange={(e) => setAddPlanned(e.target.value)}
                placeholder="0.00"
              />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button className={btnGhost} onClick={() => setShowAdd(false)}>Cancel</button>
            <button className={btnPrimary} onClick={submitAdd}>Add Budget</button>
          </div>
        </div>
      ) : null}

      {monthBudgets.length === 0 ? (
        <Empty>No budgets for this month — add one.</Empty>
      ) : (
        <DataTable columns={["Category", "Planned", "Actual", "Utilization", "Actions"]}>
          {monthBudgets.map((b, i) => {
            const cat = categories.find((c) => c.id === b.categoryId);
            const actual = actualFor(b.categoryId);
            const pct = b.plannedAmount > 0 ? Math.round((actual / b.plannedAmount) * 100) : 0;
            const over = actual > b.plannedAmount;
            return (
              <DataRow key={b.id} last={i === monthBudgets.length - 1}>
                <DataCell>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat?.color ?? "#999" }} />
                    {cat?.name ?? b.categoryId}
                  </span>
                </DataCell>
                <DataCell className="tabular-nums">
                  {editingId === b.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="w-20 rounded border border-border px-1 py-0.5 text-[11px]"
                      />
                      <button className={btnPrimary} onClick={() => saveEdit(b)}>Save</button>
                      <button className={btnGhost} onClick={() => setEditingId(null)}>✕</button>
                    </div>
                  ) : (
                    fmt(b.plannedAmount)
                  )}
                </DataCell>
                <DataCell className={`tabular-nums ${over ? "text-red-600" : ""}`}>
                  {fmt(actual)}
                </DataCell>
                <DataCell>
                  <span className={`tabular-nums ${over ? "text-red-600" : "text-muted-text"}`}>
                    {pct}%
                  </span>
                </DataCell>
                <DataCell>
                  <div className="flex items-center gap-1">
                    {editingId !== b.id ? (
                      <ActionButton label="Edit" onClick={() => beginEdit(b)} />
                    ) : null}
                    <ActionButton label="Delete" variant="danger" onClick={() => deleteBudget(b.id)} />
                  </div>
                </DataCell>
              </DataRow>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}