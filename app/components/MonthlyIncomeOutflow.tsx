"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useDashboardData } from "@/lib/dashboardData";
import { formatCurrencyCompact } from "@/lib/currency";

export function MonthlyIncomeOutflow() {
  const { monthlyIncomeOutflow } = useDashboardData();

  return (
    <div className="h-full w-full">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">
        Monthly Income vs Outflow
      </h3>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={monthlyIncomeOutflow} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 9, fill: "var(--chart-axis)" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 9, fill: "var(--chart-axis)" }}
            width={44}
            tickFormatter={(v) => formatCurrencyCompact(Number(v))}
          />
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
          <Legend
            wrapperStyle={{ fontSize: "9px", paddingTop: "2px" }}
            formatter={(value) => (
              <span style={{ color: "var(--color-secondary-text)" }}>{value}</span>
            )}
          />
          <Bar
            dataKey="income"
            name="Income"
            fill="#3B7A9E"
            radius={[2, 2, 0, 0]}
            barSize={6}
          />
          <Bar
            dataKey="outflow"
            name="Outflow"
            fill="#E87A5D"
            radius={[2, 2, 0, 0]}
            barSize={6}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
