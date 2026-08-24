"use client";

import Link from "next/link";
import { KPIGaugeGroup } from "./CircularKPI";
import { NetWorthGrowth, IncomeStreamStack } from "./HeaderCharts";
import { useDashboardData } from "@/lib/dashboardData";

export function AnnualHeader() {
  const { selectedPeriod, selectedPeriodId, setSelectedPeriodId, periods } = useDashboardData();

  return (
      <div className="grid grid-cols-1 md:grid-cols-[20fr_32fr_48fr] gap-2">
      <div className="flex flex-col justify-center">
        <h1 className="font-serif text-2xl font-semibold text-primary-text leading-tight">
          {selectedPeriod?.label || "Annual 2025 - 2026"}
        </h1>
        <p className="mt-0.5 text-[11px] text-secondary-text">
          Financial Year Overview
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="text-[10px] border border-border rounded bg-card px-1.5 py-0.5 text-secondary-text focus:outline-none focus:ring-1 focus:ring-blue"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <Link
            href="/data-entry"
            className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-secondary-text hover:bg-light-border focus:outline-none focus:ring-1 focus:ring-blue"
          >
            Data Entry
          </Link>
        </div>
      </div>
      <div className="flex items-center justify-center">
        <KPIGaugeGroup />
      </div>
      <div className="flex flex-col gap-1.5">
        <NetWorthGrowth />
        <IncomeStreamStack />
      </div>
    </div>
  );
}
