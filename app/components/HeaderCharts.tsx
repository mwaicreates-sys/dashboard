"use client";

import Link from "next/link";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useDashboardData } from "@/lib/dashboardData";
import { formatCurrencyCompact } from "@/lib/currency";

export function NetWorthGrowth() {
  const { netWorthGrowth } = useDashboardData();

  // Empty business: show an honest empty state instead of a fabricated curve.
  if (!netWorthGrowth || netWorthGrowth.length === 0) {
    return (
      <Link
        href="/growth"
        aria-label="Net Worth Growth — view growth details"
        className="group block w-full rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
      >
        <h3 className="font-inter text-[12px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
          Net Worth Growth
        </h3>
        <div className="mt-2 flex h-[70px] items-center justify-center rounded border border-dashed border-border bg-card/30 text-[13px] text-secondary-text">
          No net worth data yet
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/growth"
      aria-label="Net Worth Growth — view growth details"
      className="group block w-full rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
    >
      <h3 className="font-inter text-[12px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
        Net Worth Growth
      </h3>
      <ResponsiveContainer width="100%" height={70}>
        <AreaChart data={netWorthGrowth}>
          <defs>
            <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B7A9E" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3B7A9E" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 8, fill: "var(--chart-axis)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 8, fill: "var(--chart-axis)" }}
            width={30}
            tickFormatter={(v) => formatCurrencyCompact(Number(v))}
          />
          <Tooltip
            formatter={(value) => formatCurrencyCompact(Number(value))}
            contentStyle={{
              backgroundColor: "var(--tooltip-bg)",
              border: "1px solid var(--tooltip-border)",
              borderRadius: "4px",
              fontSize: "10px",
              color: "var(--color-primary-text)",
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#3B7A9E"
            strokeWidth={1.5}
            fill="url(#netWorthGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Link>
  );
}

export function IncomeStreamStack() {
  const { incomeStreamStack, selectedPeriod } = useDashboardData();

  const chartData = selectedPeriod
    ? selectedPeriod.months.map((month) => {
        const d = incomeStreamStack[month] || { salary: 0, freelance: 0, investments: 0, other: 0 };
        const label = new Date(month + "-01").toLocaleString("en-US", { month: "short" });
        return { month: label, ...d };
      })
    : [];

  return (
    <Link
      href="/income"
      aria-label="Income Stream Stack — view income details"
      className="group block w-full rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
    >
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
        Income Stream Stack
      </h3>
      <ResponsiveContainer width="100%" height={70}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 8, fill: "var(--chart-axis)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 8, fill: "var(--chart-axis)" }}
            width={20}
          />
          <Tooltip
            formatter={(value) => formatCurrencyCompact(Number(value))}
            contentStyle={{
              backgroundColor: "var(--tooltip-bg)",
              border: "1px solid var(--tooltip-border)",
              borderRadius: "4px",
              fontSize: "10px",
              color: "var(--color-primary-text)",
            }}
          />
          <Bar dataKey="salary" stackId="1" fill="#3B7A9E" barSize={5} />
          <Bar dataKey="freelance" stackId="1" fill="#4A909B" barSize={5} />
          <Bar dataKey="investments" stackId="1" fill="#5B8C5A" barSize={5} />
          <Bar dataKey="other" stackId="1" fill="#F4B860" barSize={5} />
        </BarChart>
      </ResponsiveContainer>
    </Link>
  );
}
