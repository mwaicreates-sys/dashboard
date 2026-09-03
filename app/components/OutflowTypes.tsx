"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDashboardData } from "@/lib/dashboardData";

export function OutflowTypes() {
  const { outflowTypes } = useDashboardData();

  return (
    <div className="h-full w-full">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">
        Outflow Types
      </h3>
      <ResponsiveContainer width="100%" height={120}>
        <PieChart>
          <Pie
            data={outflowTypes}
            cx="50%"
            cy="50%"
            innerRadius={24}
            outerRadius={42}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {outflowTypes.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => `${value}%`}

            contentStyle={{
              backgroundColor: "var(--tooltip-bg)",
              border: "1px solid var(--tooltip-border)",
              borderRadius: "4px",
              fontSize: "11px",
              color: "var(--color-primary-text)",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {outflowTypes.map((item) => (
          <div key={item.name} className="flex items-center gap-1">
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[9px] text-muted-text">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
