"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrencyFull, formatCurrencyCompact } from "@/lib/currency";
import { useDashboardData } from "@/lib/dashboardData";
import { DetailHeader, MetricCard, BreakdownTable } from "@/components/details/shared";

export default function GrowthDetails() {
  const { displayAccounts, selectedPeriod, cumulativeGrowth, monthlyIncomeOutflow } = useDashboardData();

  const period = selectedPeriod;
  const assets = displayAccounts
    .filter((a) => a.type === "checking" || a.type === "savings" || a.type === "investment")
    .reduce((sum, a) => sum + a.currentBalance, 0);
  const debts = displayAccounts
    .filter((a) => a.type === "credit" || a.type === "loan")
    .reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
  const currentNetWorth = assets - debts;

  const openingAssets = displayAccounts
    .filter((a) => a.type === "checking" || a.type === "savings" || a.type === "investment")
    .reduce((sum, a) => sum + a.openingBalance, 0);
  const openingDebts = displayAccounts
    .filter((a) => a.type === "credit" || a.type === "loan")
    .reduce((sum, a) => sum + Math.abs(a.openingBalance), 0);
  const startingNetWorth = openingAssets - openingDebts;

  const change = currentNetWorth - startingNetWorth;
  const growthPct = startingNetWorth !== 0 ? Math.round((change / Math.abs(startingNetWorth)) * 100) : 0;

  const accountRows = displayAccounts.map((a) => ({
    Account: a.name,
    Type: a.type.charAt(0).toUpperCase() + a.type.slice(1),
    Opening: formatCurrencyFull(a.openingBalance),
    Current: formatCurrencyFull(a.currentBalance),
    Change: formatCurrencyFull(a.currentBalance - a.openingBalance),
  }));

  const monthRows = monthlyIncomeOutflow.map((m, i) => ({
    Month: m.month,
    Income: formatCurrencyFull(m.income),
    Outflow: formatCurrencyFull(m.outflow),
    Net: formatCurrencyFull(m.income - m.outflow),
    Cumulative: cumulativeGrowth[i] ? `${cumulativeGrowth[i].value}` : "—",
  }));

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-surface p-3 md:p-4 shadow-sm">
        <DetailHeader title="Growth Details" subtitle="Net worth progression and cumulative growth" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <MetricCard label="Starting Net Worth" value={formatCurrencyFull(startingNetWorth)} sub="Opening balances minus debts" />
          <MetricCard label="Current Net Worth" value={formatCurrencyFull(currentNetWorth)} sub={`${period?.label ?? ""}`} />
          <MetricCard label="Change" value={`${change >= 0 ? "+" : ""}${formatCurrencyFull(change)}`} sub="Current vs starting" />
          <MetricCard label="Growth" value={`${growthPct >= 0 ? "+" : ""}${growthPct}%`} sub="Relative to start" />
        </div>

        <div className="mt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Cumulative Net Savings</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={cumulativeGrowth}>
              <defs>
                <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F4B860" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#F4B860" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--chart-axis)" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--chart-axis)" }} width={54} tickFormatter={(v) => formatCurrencyCompact(Number(v))} />
              <Tooltip
                formatter={(value) => formatCurrencyCompact(Number(value))}
                contentStyle={{
                  backgroundColor: "var(--tooltip-bg)",
                  border: "1px solid var(--tooltip-border)",
                  borderRadius: "4px",
                  fontSize: "11px",
                  color: "var(--color-primary-text)",
                }}
              />
              <Area type="monotone" dataKey="value" name="Cumulative" stroke="#F4B860" strokeWidth={1.5} fill="url(#growthGradient)" />
            </AreaChart>
          </ResponsiveContainer>
          <p className="mt-1 text-[10px] text-muted-text">
            Cumulative growth is derived as the running total of monthly income minus expenses across the period.
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Account Contributions</h3>
            <BreakdownTable headers={["Account", "Type", "Opening", "Current", "Change"]} rows={accountRows} />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Monthly Breakdown</h3>
            <BreakdownTable headers={["Month", "Income", "Outflow", "Net", "Cumulative"]} rows={monthRows} />
          </div>
        </div>
      </div>
    </main>
  );
}
