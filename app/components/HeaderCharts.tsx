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

/**
 * Fallback palette for categories that carry no color anywhere (neither on the
 * category row nor in the shared income-split rows). Mirrors the palette used
 * by the shared calculations so the mini-charts stay consistent with the rest
 * of the dashboard.
 */
const CHART_FALLBACK_PALETTE = [
  "#3B7A9E",
  "#5A9F90",
  "#E87A5D",
  "#F4B860",
  "#7A9C57",
  "#D96B82",
  "#A67FD0",
  "#5BA9D1",
  "#D28A48",
  "#7CA8A2",
  "#C65D6A",
  "#6B8AC9",
];

/**
 * Y-domain fitted to the displayed net-worth series with a little breathing
 * room. It deliberately does NOT floor at zero: the default `[0, 'auto']`
 * domain spans 0 → dataMax, which flattens a mid-range trend into the top of
 * the chart. Safe for all-zero and single-value series.
 */
function netWorthDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];

  let min = values[0];
  let max = values[0];
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (min === max) {
    // All values identical (incl. all-zero): give the line a centered band.
    const pad = min === 0 ? 1 : Math.abs(min) * 0.08;
    return [min - pad, max + pad];
  }

  const pad = (max - min) * 0.15;
  return [min - pad, max + pad];
}

export function NetWorthGrowth() {
  const { netWorthGrowth } = useDashboardData();

  if (!netWorthGrowth || netWorthGrowth.length === 0) {
    return (
      <Link
        href="/growth"
        aria-label="Net Worth Growth — view growth details"
        className="group flex h-full w-full flex-col rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
      >
        <h3 className="font-inter text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
          Net Worth Growth
        </h3>
        <div className="mt-1.5 flex min-h-[150px] flex-1 items-center justify-center rounded border border-dashed border-border bg-card/30 text-[11px] sm:text-[13px] text-secondary-text">
          No net worth data yet
        </div>
      </Link>
    );
  }

  const values = netWorthGrowth.map((point) => Number(point.value)).filter((value) => Number.isFinite(value));
  const domain = netWorthDomain(values);

  return (
    <Link
      href="/growth"
      aria-label="Net Worth Growth — view growth details"
      className="group flex h-full w-full flex-col rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
    >
      <h3 className="font-inter text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
        Net Worth Growth
      </h3>
      <ResponsiveContainer className="min-w-0 flex-1 min-h-[150px]" width="100%">
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
            domain={domain}
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
  const { incomeStreamStack, selectedPeriod, categories, incomeSplit } = useDashboardData();

  // Canonical per-category colors come from the SAME shared source the
  // Income Split card uses (category.color, else the shared palette), so the
  // stacked bars in this card and its legend match the rest of the dashboard.
  const splitColorByKey = new Map<string, string>();
  for (const row of incomeSplit) {
    splitColorByKey.set(normalizeSeriesKey(row.name), row.color);
  }

  const categorySeries = categories
    .filter((category) => category.type === "income")
    .map((category, index) => {
      const key = normalizeSeriesKey(category.name);
      return {
        key,
        label: category.name,
        color:
          category.color ||
          splitColorByKey.get(key) ||
          CHART_FALLBACK_PALETTE[index % CHART_FALLBACK_PALETTE.length],
      };
    });

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
        className="group flex h-full w-full flex-col rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
      >
        <h3 className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
          Income Stream Stack
        </h3>
        <div className="mt-1.5 flex min-h-[150px] flex-1 items-center justify-center rounded border border-dashed border-border bg-card/30 text-[11px] sm:text-[13px] text-secondary-text">
          No income data yet
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/income"
      aria-label="Income Stream Stack — view income details"
      className="group flex h-full w-full flex-col rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
    >
      <h3 className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
        Income Stream Stack
      </h3>
      <ResponsiveContainer className="min-w-0 flex-1 min-h-[150px]" width="100%">
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
      <div className="mt-1 flex flex-wrap justify-center gap-x-2.5 gap-y-0.5">
        {categorySeries.map((item) => (
          <div key={item.key} className="flex items-center gap-1">
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[9px] text-muted-text">{item.label}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}