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

export function NetWorthGrowth() {
  const { netWorthGrowth } = useDashboardData();

  return (
    <Link
      href="/growth"
      aria-label="Net Worth Growth — view growth details"
      className="group block w-full rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
    >
      <h3 className="text-[9px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
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
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E0D9" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 8, fill: "#999999" }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 8, fill: "#999999" }}
            width={20}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FAFAFA",
              border: "1px solid #E2E0D9",
              borderRadius: "4px",
              fontSize: "10px",
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
      <h3 className="text-[9px] font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
        Income Stream Stack
      </h3>
      <ResponsiveContainer width="100%" height={70}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E0D9" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 8, fill: "#999999" }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 8, fill: "#999999" }}
            width={20}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FAFAFA",
              border: "1px solid #E2E0D9",
              borderRadius: "4px",
              fontSize: "10px",
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
