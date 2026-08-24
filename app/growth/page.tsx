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
import { useDashboardData } from "@/lib/dashboardData";
import { DetailHeader, MetricCard, BreakdownTable } from "@/components/details/shared";

export default function GrowthDetails() {
  const { accounts, transactions, selectedPeriod, cumulativeGrowth, monthlyIncomeOutflow } = useDashboardData();

  const period = selectedPeriod;
  const periodTx = transactions.filter(
    (t) => t.date >= (period?.startDate ?? "") && t.date <= (period?.endDate ?? "")
  );

  const assets = accounts
    .filter((a) => a.type === "checking" || a.type === "savings" || a.type === "investment")
    .reduce((sum, a) => sum + a.currentBalance, 0);
  const debts = accounts
    .filter((a) => a.type === "credit" || a.type === "loan")
    .reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
  const currentNetWorth = assets - debts;

  const openingAssets = accounts
    .filter((a) => a.type === "checking" || a.type === "savings" || a.type === "investment")
    .reduce((sum, a) => sum + a.openingBalance, 0);
  const openingDebts = accounts
    .filter((a) => a.type === "credit" || a.type === "loan")
    .reduce((sum, a) => sum + Math.abs(a.openingBalance), 0);
  const startingNetWorth = openingAssets - openingDebts;

  const change = currentNetWorth - startingNetWorth;
  const growthPct = startingNetWorth !== 0 ? Math.round((change / Math.abs(startingNetWorth)) * 100) : 0;

  const accountRows = accounts.map((a) => ({
    Account: a.name,
    Type: a.type.charAt(0).toUpperCase() + a.type.slice(1),
    Opening: `$${a.openingBalance.toLocaleString()}`,
    Current: `$${a.currentBalance.toLocaleString()}`,
    Change: `$${(a.currentBalance - a.openingBalance).toLocaleString()}`,
  }));

  const monthRows = monthlyIncomeOutflow.map((m, i) => ({
    Month: m.month,
    Income: `$${m.income.toLocaleString()}`,
    Outflow: `$${m.outflow.toLocaleString()}`,
    Net: `$${(m.income - m.outflow).toLocaleString()}`,
    Cumulative: cumulativeGrowth[i] ? `${cumulativeGrowth[i].value}` : "—",
  }));

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-white p-3 md:p-4 shadow-sm">
        <DetailHeader title="Growth Details" subtitle="Net worth progression and cumulative growth" />
        <div className="mt-3 h-px bg-border" />

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <MetricCard label="Starting Net Worth" value={`$${startingNetWorth.toLocaleString()}`} sub="Opening balances minus debts" />
          <MetricCard label="Current Net Worth" value={`$${currentNetWorth.toLocaleString()}`} sub={`${period?.label ?? ""}`} />
          <MetricCard label="Change" value={`${change >= 0 ? "+" : ""}$${change.toLocaleString()}`} sub="Current vs starting" />
          <MetricCard label="Growth" value={`${growthPct >= 0 ? "+" : ""}${growthPct}%`} sub="Relative to start" />
        </div>

        <div className="mt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">Cumulative Net Savings ($ hundreds)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={cumulativeGrowth}>
              <defs>
                <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F4B860" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#F4B860" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E0D9" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#999999" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#999999" }} width={40} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#FAFAFA",
                  border: "1px solid #E2E0D9",
                  borderRadius: "4px",
                  fontSize: "11px",
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
