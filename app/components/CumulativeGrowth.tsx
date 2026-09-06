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
import { formatCurrencyCompact } from "@/lib/currency";

export function CumulativeGrowth() {
  const { cumulativeGrowth } = useDashboardData();

  return (
    <div className="flex h-full min-h-[220px] w-full min-w-0 flex-col">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">
        Cumulative Growth
      </h3>
      <div className="mt-1 min-h-[120px] min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={cumulativeGrowth}>
            <defs>
              <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F4B860" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#F4B860" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: "var(--chart-axis)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: "var(--chart-axis)" }}
              width={34}
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
            <Area
              type="monotone"
              dataKey="value"
              stroke="#F4B860"
              strokeWidth={1.5}
              fill="url(#cumulativeGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
