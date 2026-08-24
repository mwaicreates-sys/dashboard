"use client";

import { useState } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { Goal, GoalStatus } from "@/data/model/types";
import {
  Field,
  TextInput,
  SelectBox,
  SectionTitle,
  CardList,
  CardRow,
  ActionButton,
  btnPrimary,
  btnGhost,
  Empty,
} from "./shared";

const STATUSES: GoalStatus[] = ["active", "on-track", "at-risk", "completed", "paused"];
const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function GoalsSection() {
  const { goals, addGoal, updateGoal, deleteGoal } = useDashboardData();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState<GoalStatus>("active");

  const resetForm = () => {
    setEditing(null);
    setName("");
    setTargetAmount("");
    setCurrentAmount("");
    setTargetDate("");
    setStatus("active");
    setShowForm(false);
  };

  const startEdit = (g: Goal) => {
    setEditing(g);
    setName(g.name);
    setTargetAmount(String(g.targetAmount));
    setCurrentAmount(String(g.currentAmount));
    setTargetDate(g.targetDate);
    setStatus(g.status);
    setShowForm(true);
  };

  const submit = () => {
    if (!name || !targetDate) return;
    const target = Number(targetAmount);
    const current = Number(currentAmount);
    if (!Number.isFinite(target) || target <= 0) return;
    if (editing) {
      updateGoal(editing.id, {
        name,
        targetAmount: target,
        currentAmount: Number.isFinite(current) ? current : 0,
        targetDate,
        status,
      });
    } else {
      addGoal({
        name,
        targetAmount: target,
        currentAmount: Number.isFinite(current) ? current : 0,
        targetDate,
        status,
      });
    }
    resetForm();
  };

  return (
    <div>
      <SectionTitle>Goals</SectionTitle>

      <div className="mb-2 flex items-center justify-end">
        <button className={btnPrimary} onClick={() => { resetForm(); setShowForm((s) => !s); }}>
          {showForm ? "Cancel" : "+ Create"}
        </button>
      </div>

      {showForm ? (
        <div className="mb-2 space-y-1.5 rounded border border-border bg-card p-2">
          <Field label="Goal Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Save for a house" />
          </Field>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Target Amount">
              <TextInput type="number" min="0" step="0.01" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Current Amount">
              <TextInput type="number" min="0" step="0.01" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} placeholder="0.00" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Target Date">
              <TextInput type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </Field>
            <Field label="Status">
              <SelectBox value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </SelectBox>
            </Field>
          </div>
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button className={btnGhost} onClick={resetForm}>Cancel</button>
            <button className={btnPrimary} onClick={submit}>
              {editing ? "Save" : "Create Goal"}
            </button>
          </div>
        </div>
      ) : null}

      {goals.length === 0 ? (
        <Empty>No goals — create one.</Empty>
      ) : (
        <CardList>
          {goals.map((g) => {
            const pct =
              g.targetAmount > 0
                ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100))
                : 0;
            return (
              <CardRow
                key={g.id}
                title={
                  <span className="flex items-center gap-1.5">
                    {g.name}
                    <span className="text-[9px] uppercase text-muted-text">{g.status}</span>
                  </span>
                }
                subtitle={
                  <span className="flex items-center gap-1.5">
                    <span className="tabular-nums">
                      {fmt(g.currentAmount)} / {fmt(g.targetAmount)}
                    </span>
                    <span className="tabular-nums text-muted-text">({pct}%)</span>
                    <span className="text-muted-text">by {g.targetDate}</span>
                  </span>
                }
                right={
                  <>
                    <ActionButton label="Edit" onClick={() => startEdit(g)} />
                    <ActionButton label="Del" variant="danger" onClick={() => deleteGoal(g.id)} />
                  </>
                }
              />
            );
          })}
        </CardList>
      )}
    </div>
  );
}