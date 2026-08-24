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

export function CumulativeGrowth() {
  const { cumulativeGrowth } = useDashboardData();

  return (
    <div className="h-full w-full">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">
        Cumulative Growth
      </h3>
      <ResponsiveContainer width="100%" height={130}>
        <AreaChart data={cumulativeGrowth}>
          <defs>
            <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F4B860" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#F4B860" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E0D9" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 9, fill: "#999999" }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 9, fill: "#999999" }}
            width={24}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FAFAFA",
              border: "1px solid #E2E0D9",
              borderRadius: "4px",
              fontSize: "11px",
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
  );
}
