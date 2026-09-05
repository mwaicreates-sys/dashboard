"use client";

import { useState } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { formatMoneyFull } from "@/lib/dates";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { GoalStatus } from "@/data/model/types";
import { PlusIcon, TargetIcon } from "./icons";

const inputCls =
  "h-9 w-full rounded-xl border border-border bg-card px-3 text-xs text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60";

/** Lightweight financial targets with visual progress — persisted via the store. */
export function GoalsProgress() {
  const { goals, displayGoals, currency, convertAmount, updateGoal, addGoal, deleteGoal } = useDashboardData();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");

  const save = () => {
    const t = Number(target);
    if (!name.trim() || !t || t <= 0) return;
    addGoal({ name: name.trim(), targetAmount: t, currentAmount: 0, targetDate: deadline || "", status: "active", currency });
    setName("");
    setTarget("");
    setDeadline("");
    setAdding(false);
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue/10 text-blue">
            <TargetIcon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-primary-text">Goals</h2>
                        <p className="text-[11px] text-muted-text">Track progress toward targets</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdding((s) => !s)}
          aria-label={adding ? "Cancel adding goal" : "Add goal"}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-secondary-text transition-colors hover:bg-surface hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
        >
          {adding ? "×" : <PlusIcon className="h-4 w-4" />}
        </button>
      </div>

      {displayGoals.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed border-border bg-card/30 px-3 py-4 text-center text-[11px] text-muted-text">
          No goals yet. Add a target to track progress.
        </p>
      ) : (
        <ul className="space-y-3">
          {displayGoals.map((dg) => {
            const pct = dg.targetAmount > 0 ? Math.min(100, Math.round((dg.currentAmount / dg.targetAmount) * 100)) : 0;
            const completed = dg.currentAmount >= dg.targetAmount && dg.targetAmount > 0;
            return (
              <li key={dg.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-primary-text">{dg.name}</p>
                    <p className="text-[10px] tabular-nums text-muted-text">
                      {formatMoneyFull(dg.currentAmount)} of {formatMoneyFull(dg.targetAmount)}
                      {dg.targetDate ? ` · by ${dg.targetDate}` : ""}
                      {completed ? " · reached" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* Record progress: input is in the display currency; store the
                        added value back into the goal's ORIGINAL currency so a goal is
                        never double-converted later. */}
                    <AddToGoal
                      onAdd={(v) => {
                        const raw = goals.find((x) => x.id === dg.id) ?? dg;
                        const goalCurrency = raw.currency ?? DEFAULT_CURRENCY;
                        const baseAdd = convertAmount(v, currency, goalCurrency) ?? v;
                        const next = raw.currentAmount + baseAdd;
                        const status: GoalStatus =
                          next >= raw.targetAmount && raw.targetAmount > 0
                            ? "completed"
                            : raw.status === "completed" && next < raw.targetAmount
                              ? "active"
                              : raw.status;
                        updateGoal(raw.id, { currentAmount: next, status });
                      }}
                    />
                    <span className={`text-[11px] font-semibold tabular-nums ${completed ? "text-green" : "text-primary-text"}`}>
                      {pct}%
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteGoal(dg.id)}
                      aria-label={`Delete goal ${dg.name}`}
                      className="rounded-md px-1 text-[10px] text-muted-text transition-colors hover:text-orange"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border/60">
                  <div className={`h-full rounded-full transition-all duration-500 ${completed ? "bg-green" : "bg-blue"}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <AddGoalForm
          name={name}
          setName={setName}
          target={target}
          setTarget={setTarget}
          deadline={deadline}
          setDeadline={setDeadline}
          onSave={save}
          onCancel={() => setAdding(false)}
        />
      ) : null}
    </section>
  );
}

function AddGoalForm({
  name,
  setName,
  target,
  setTarget,
  deadline,
  setDeadline,
  onSave,
  onCancel,
}: {
  name: string;
  setName: (v: string) => void;
  target: string;
  setTarget: (v: string) => void;
  deadline: string;
  setDeadline: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card/40 p-3">
      <label className="min-w-[140px] flex-1">
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Goal</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New laptop fund" aria-label="Goal name" className={inputCls} />
      </label>
      <label className="w-24">
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Target</span>
        <input type="number" min="0" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" aria-label="Target amount" className={inputCls} />
      </label>
      <label className="w-36">
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Deadline</span>
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Target date" className={inputCls} />
      </label>
      <button type="button" onClick={onSave} disabled={!name.trim() || !Number(target)} className="h-9 rounded-xl bg-blue px-3.5 text-xs font-medium text-white transition-colors hover:bg-blue/90 disabled:opacity-40">
        Save
      </button>
      <button type="button" onClick={onCancel} className="h-9 rounded-xl border border-border bg-card px-3 text-xs text-secondary-text transition-colors hover:bg-surface">
        Cancel
      </button>
    </div>
  );
}

function AddToGoal({ onAdd }: { onAdd: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");

  const confirm = () => {
    if (Number(val) > 0) {
      onAdd(Number(val));
      setVal("");
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Record progress toward goal"
        title="Record progress"
        className="rounded-md px-1 text-[11px] font-medium text-blue transition-colors hover:text-blue/80"
      >
        +
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        min="0"
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") confirm();
          if (e.key === "Escape") setOpen(false);
        }}
        aria-label="Amount to add to goal"
        placeholder="0"
        className="h-6 w-16 rounded-md border border-border bg-card px-1.5 text-right text-[11px] tabular-nums text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
      />
      <button type="button" onClick={confirm} disabled={!Number(val)} aria-label="Confirm amount" className="text-[10px] font-medium text-green disabled:opacity-40">
        ✓
      </button>
    </span>
  );
}