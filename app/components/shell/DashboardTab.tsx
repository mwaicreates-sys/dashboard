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
 * Hierarchy: KPIs → Charts → Monthly income → Analysis →
 * (secondary) Upcoming & recurring → Export & reports.
 *
 * Year context and tab identity are rendered by the shell header.
 */
export function DashboardTab() {
  const router = useRouter();

  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-2.5 md:space-y-3">
        {/* Primary KPIs */}
        <section className="grid grid-cols-1 gap-3 sm:gap-3.5 md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr]">
          <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
            <p className="mb-2 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
              Key metrics
            </p>
            <KPIGaugeGroup />
          </div>
          <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-border bg-surface p-3 sm:gap-3 sm:p-4 md:grid-cols-2">
            <NetWorthGrowth />
            <IncomeStreamStack />
          </div>
        </section>

        {/* Four primary charts */}
        <VisualizationGrid />

        {/* Monthly income & spending — January through December */}
        <MonthlyPerformance onOpenWeeks={() => router.push("/weeks")} />

        {/* Primary financial analysis */}
        <InformationGrid />
      </div>

      <aside className="min-w-0 space-y-3.5 lg:sticky lg:top-4 lg:self-start">
        <RecurringSection />
        <ExportReports />
      </aside>
    </div>
  );
}