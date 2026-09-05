"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDashboardData } from "@/lib/dashboardData";

export function SavingsGoal() {
  const { savingsGoal } = useDashboardData();
  const hasData = savingsGoal.length > 0;

  return (
    <div className="h-full w-full">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">
        Savings Goal
      </h3>
      <ResponsiveContainer width="100%" height={120}>
        <PieChart>
          {hasData ? (
            <Pie
              data={savingsGoal}
              cx="50%"
              cy="50%"
              innerRadius={24}
              outerRadius={42}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {savingsGoal.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          ) : (
            <Pie
              data={[{ name: "empty", value: 1 }]}
              cx="50%"
              cy="50%"
              innerRadius={24}
              outerRadius={42}
              dataKey="value"
              stroke="none"
              fill="var(--color-border)"
              label={({ cx, cy }) => (
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-muted-text text-[10px] font-medium"
                >
                  No data yet
                </text>
              )}
              labelLine={false}
            />
          )}
          {hasData && (
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--tooltip-bg)",
                border: "1px solid var(--tooltip-border)",
                borderRadius: "4px",
                fontSize: "11px",
                color: "var(--color-primary-text)",
              }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      {hasData && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
          {savingsGoal.map((item) => (
            <div key={item.name} className="flex items-center gap-1">
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[9px] text-muted-text">{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
