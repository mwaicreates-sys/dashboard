"use client";

import { useRouter } from "next/navigation";
import { KPIGaugeGroup } from "@/components/CircularKPI";
import { NetWorthGrowth, IncomeStreamStack } from "@/components/HeaderCharts";
import { VisualizationGrid } from "@/components/VisualizationGrid";
import { InformationGrid } from "@/components/InformationGrid";
import { MonthlyPerformance } from "./MonthlyPerformance";
import { RecurringSection } from "./RecurringSection";
import { ExportReports } from "./ExportReports";

/**
 * Dashboard — financial analysis for one calendar year.
 * Vertical flow: Key metrics → primary charts (two equal rows) →
 * secondary charts → Monthly performance → Top tables →
 * Upcoming & recurring | Export & reports.
 *
 * Year context and tab identity are rendered by the shell header.
 */
export function DashboardTab() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      {/* Key metrics — full-width row */}
      <section className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
        <p className="mb-2 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
          Key metrics
        </p>
        <KPIGaugeGroup />
      </section>

      {/* Primary charts — two equal-width rows */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
          <NetWorthGrowth />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
          <IncomeStreamStack />
        </div>
      </div>

      {/* Chart overview — Income vs Outflow | Income Split, then Outflow Types | Cumulative Growth */}
      <VisualizationGrid />

      {/* Monthly income & spending — January through December */}
      <MonthlyPerformance onOpenWeeks={() => router.push("/weeks")} />

      {/* Top 20 Outflow | Top 20 Spendings */}
      <InformationGrid />

      {/* Upcoming & recurring | Export & reports */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
        <RecurringSection />
        <ExportReports />
      </div>
    </div>
  );
}