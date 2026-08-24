"use client";

import { useDashboardData } from "@/lib/dashboardData";

export function ProgressList() {
  const { progress } = useDashboardData();

  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-secondary-text">
        Progress
      </h3>
      <div className="space-y-2">
        {progress.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-primary-text">{item.label}</span>
              <span className="text-[10px] text-muted-text tabular-nums">
                {item.value}/{item.total}
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-border">
              <div
                className="h-1 rounded-full bg-teal"
                style={{ width: `${item.total > 0 ? Math.min((item.value / item.total) * 100, 100) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
