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
  const hasData = outflowTypes.length > 0;

  return (
    <div className="flex h-full min-h-[220px] w-full min-w-0 flex-col">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">
        Outflow Types
      </h3>
      <div className="mt-1 min-h-[120px] min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {hasData ? (
              <Pie
                data={outflowTypes}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={52}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {outflowTypes.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            ) : (
              <Pie
                data={[{ name: "empty", value: 1 }]}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={52}
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
                formatter={(value) => `${value}%`}

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
      </div>
      {hasData && (
        <div className="mt-1 flex flex-wrap justify-center gap-x-2.5 gap-y-0.5">
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
      )}
    </div>
  );
}
