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

export function MonthlyIncomeOutflow() {
  const { monthlyIncomeOutflow } = useDashboardData();

  return (
    <div className="h-full w-full">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">
        Monthly Income vs Outflow
      </h3>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={monthlyIncomeOutflow} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E0D9" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 9, fill: "#999999" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 9, fill: "#999999" }}
            width={32}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FAFAFA",
              border: "1px solid #E2E0D9",
              borderRadius: "4px",
              fontSize: "11px",
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: "9px", paddingTop: "2px" }}
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
