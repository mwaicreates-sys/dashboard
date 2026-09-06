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

function normalizeSeriesKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "other";
}

export function NetWorthGrowth() {
  const { netWorthGrowth } = useDashboardData();

  if (!netWorthGrowth || netWorthGrowth.length === 0) {
    return (
      <Link
        href="/growth"
        aria-label="Net Worth Growth — view growth details"
        className="group block w-full rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
      >
        <h3 className="font-inter text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
          Net Worth Growth
        </h3>
        <div className="mt-1.5 flex h-[50px] sm:h-[70px] items-center justify-center rounded border border-dashed border-border bg-card/30 text-[11px] sm:text-[13px] text-secondary-text">
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
      <h3 className="font-inter text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
        Net Worth Growth
      </h3>
      <ResponsiveContainer width="100%" height={50}>
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
            tick={{ fontSize: 7, fill: "var(--chart-axis)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 7, fill: "var(--chart-axis)" }}
            width={25}
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
          <Area type="monotone" dataKey="value" stroke="#3B7A9E" strokeWidth={1.5} fill="url(#netWorthGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </Link>
  );
}

export function IncomeStreamStack() {
  const { incomeStreamStack, selectedPeriod, categories } = useDashboardData();

  const categorySeries = categories
    .filter((category) => category.type === "income")
    .map((category) => ({
      key: normalizeSeriesKey(category.name),
      label: category.name,
      color: category.color || "#3B7A9E",
    }));

  const chartData = selectedPeriod
    ? selectedPeriod.months.map((month) => {
        const monthData = incomeStreamStack[month] || {};
        const row: Record<string, number | string> = {
          month: new Date(`${month}-01`).toLocaleString("en-US", { month: "short" }),
        };

        for (const item of categorySeries) {
          row[item.key] = Number(monthData[item.key] ?? 0);
        }

        return row;
      })
    : [];

  const hasMeaningfulIncomeData = chartData.some((entry) =>
    categorySeries.some((item) => Number(entry[item.key] ?? 0) > 0)
  );

  if (!selectedPeriod || !hasMeaningfulIncomeData) {
    return (
      <Link
        href="/income"
        aria-label="Income Stream Stack — view income details"
        className="group block w-full rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
      >
        <h3 className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
          Income Stream Stack
        </h3>
        <div className="mt-1.5 flex h-[50px] sm:h-[70px] items-center justify-center rounded border border-dashed border-border bg-card/30 text-[11px] sm:text-[13px] text-secondary-text">
          No income data yet
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/income"
      aria-label="Income Stream Stack — view income details"
      className="group block w-full rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
    >
      <h3 className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
        Income Stream Stack
      </h3>
      <ResponsiveContainer width="100%" height={50}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 6, fill: "var(--chart-axis)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 6, fill: "var(--chart-axis)" }}
            width={15}
            domain={[0, "auto"]}
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
          {categorySeries.map((item) => (
            <Bar key={item.key} dataKey={item.key} name={item.label} stackId="income" fill={item.color} barSize={4} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Link>
  );
}