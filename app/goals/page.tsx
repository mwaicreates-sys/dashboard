"use client";

import { useDashboardData } from "@/lib/dashboardData";
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
  const { goals, accounts } = useDashboardData();

  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const totalCurrent = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const completedCount = goals.filter((g) => g.currentAmount >= g.targetAmount).length;
  const overallPct = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;

  const savingsBalance = accounts
    .filter((a) => a.type === "savings")
    .reduce((sum, a) => sum + a.currentBalance, 0);
  const investmentBalance = accounts
    .filter((a) => a.type === "investment")
    .reduce((sum, a) => sum + a.currentBalance, 0);

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-white p-3 md:p-4 shadow-sm">
        <DetailHeader title="Goals Details" subtitle="Financial goals, progress, and status" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <MetricCard label="Total Goals" value={String(goals.length)} sub={`${completedCount} complete`} />
          <MetricCard label="Overall Progress" value={`${overallPct}%`} sub={`$${totalCurrent.toLocaleString()} of $${totalTarget.toLocaleString()}`} />
          <MetricCard label="Savings Held" value={`$${savingsBalance.toLocaleString()}`} sub="Backing savings goals" />
          <MetricCard label="Investments Held" value={`$${investmentBalance.toLocaleString()}`} sub="Backing growth goals" />
        </div>

        <div className="mt-3 space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-secondary-text">All Goals</h3>
          {goals.length === 0 ? (
            <p className="rounded border border-border bg-card p-3 text-[11px] text-muted-text">
              No goals yet — add one from Data Entry → Goals.
            </p>
          ) : (
            goals.map((g) => {
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
                      ${g.currentAmount.toLocaleString()} of ${g.targetAmount.toLocaleString()}
                      {" · "}
                      {remaining > 0 ? `$${remaining.toLocaleString()} remaining` : "Goal reached"}
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
            rows={goals.map((g) => ({
              Goal: g.name,
              Current: `$${g.currentAmount.toLocaleString()}`,
              Target: `$${g.targetAmount.toLocaleString()}`,
              Remaining: `$${Math.max(g.targetAmount - g.currentAmount, 0).toLocaleString()}`,
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
