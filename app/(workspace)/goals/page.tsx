"use client";

import { useDashboardData } from "@/lib/dashboardData";
import { formatCurrencyFull } from "@/lib/currency";
import { DetailHeader, MetricCard, BreakdownTable, ProgressBar } from "@/components/details/shared";
import { GoalStatus } from "@/data/model/types";

const STATUS_STYLE: Record<GoalStatus, string> = {
  "on-track": "bg-green/15 text-green",
  completed: "bg-teal/15 text-teal",
  active: "bg-blue/15 text-blue",
  "at-risk": "bg-orange/15 text-orange",
  paused: "bg-muted-text/15 text-secondary-text",
};

export default function GoalsDetails() {
  const { displayGoals, displayAccounts } = useDashboardData();

  const totalTarget = displayGoals.reduce((sum, g) => sum + g.targetAmount, 0);
  const totalCurrent = displayGoals.reduce((sum, g) => sum + g.currentAmount, 0);
  const completedCount = displayGoals.filter((g) => g.currentAmount >= g.targetAmount).length;
  const overallPct = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;

  const savingsBalance = displayAccounts
    .filter((a) => a.type === "savings")
    .reduce((sum, a) => sum + a.currentBalance, 0);
  const investmentBalance = displayAccounts
    .filter((a) => a.type === "investment")
    .reduce((sum, a) => sum + a.currentBalance, 0);

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-surface p-3 md:p-4 shadow-sm">
        <DetailHeader title="Goals Details" subtitle="Financial goals, progress, and status" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <MetricCard label="Total Goals" value={String(displayGoals.length)} sub={`${completedCount} complete`} />
          <MetricCard label="Overall Progress" value={`${overallPct}%`} sub={`${formatCurrencyFull(totalCurrent)} of ${formatCurrencyFull(totalTarget)}`} />
          <MetricCard label="Savings Held" value={formatCurrencyFull(savingsBalance)} sub="Backing savings goals" />
          <MetricCard label="Investments Held" value={formatCurrencyFull(investmentBalance)} sub="Backing growth goals" />
        </div>

        <div className="mt-3 space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-secondary-text">All Goals</h3>
          {displayGoals.length === 0 ? (
            <p className="rounded border border-border bg-card p-3 text-[11px] text-muted-text">
              No goals yet. Add one from the Entry tab.
            </p>
          ) : (
            displayGoals.map((g) => {
              const remaining = Math.max(g.targetAmount - g.currentAmount, 0);
              const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
              return (
                <div key={g.id} className="rounded border border-border bg-card p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-[12px] font-medium text-primary-text">{g.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${STATUS_STYLE[g.status]}`}>
                      {g.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-text tabular-nums">
                    <span>
                      {formatCurrencyFull(g.currentAmount)} of {formatCurrencyFull(g.targetAmount)}
                      {" · "}
                      {remaining > 0 ? `${formatCurrencyFull(remaining)} remaining` : "Goal reached"}
                    </span>
                    <span>Target: {g.targetDate}</span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar
                      value={g.currentAmount}
                      total={g.targetAmount}
                      color={pct >= 100 ? "bg-green" : "bg-teal"}
                    />
                  </div>
                  <p className="mt-1 text-right text-[10px] font-semibold text-primary-text tabular-nums">{pct}%</p>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Summary Table</h3>
          <BreakdownTable
            headers={["Goal", "Current", "Target", "Remaining", "%", "Target Date", "Status"]}
            rows={displayGoals.map((g) => ({
              Goal: g.name,
              Current: formatCurrencyFull(g.currentAmount),
              Target: formatCurrencyFull(g.targetAmount),
              Remaining: formatCurrencyFull(Math.max(g.targetAmount - g.currentAmount, 0)),
              "%": `${g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0}%`,
              "Target Date": g.targetDate,
              Status: g.status,
            }))}
          />
        </div>
      </div>
    </main>
  );
}