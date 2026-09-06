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
    <div className="flex h-full min-h-[200px] w-full flex-col">
      <h3 className="mb-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-secondary-text">
        Monthly Income vs Outflow
      </h3>
      <div className="mt-2 min-h-[120px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyIncomeOutflow} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 7, fill: "var(--chart-axis)" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 7, fill: "var(--chart-axis)" }}
              width={35}
              domain={[0, "auto"]}
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
            <Bar dataKey="income" name="Income" fill="#3B7A9E" radius={[2, 2, 0, 0]} barSize={5} />
            <Bar dataKey="outflow" name="Outflow" fill="#E87A5D" radius={[2, 2, 0, 0]} barSize={5} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 border-t border-border pt-2">
        <Legend
          wrapperStyle={{ fontSize: "8px" }}
          formatter={(value) => (
            <span style={{ color: "var(--color-secondary-text)" }}>{value}</span>
          )}
        />
      </div>
    </div>
  );
}