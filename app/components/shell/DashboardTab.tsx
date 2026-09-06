"use client";

import { useState } from "react";
import { KPIGaugeGroup } from "@/components/CircularKPI";
import { NetWorthGrowth, IncomeStreamStack } from "@/components/HeaderCharts";
import { VisualizationGrid } from "@/components/VisualizationGrid";
import { InformationGrid } from "@/components/InformationGrid";
import { MonthlyPerformance } from "./MonthlyPerformance";
import { RecurringSection } from "./RecurringSection";
import { ExportReports } from "./ExportReports";
import { WeeksSheet } from "./WeeksSheet";

/**
 * Dashboard — financial analysis for one calendar year.
 * Hierarchy: KPIs → Charts → Monthly income → Analysis →
 * (secondary) Upcoming & recurring → Export & reports.
 *
 * Year context and tab identity are rendered by the shell header.
 */
export function DashboardTab() {
  const [weeksOpen, setWeeksOpen] = useState(false);

  return (
    <div className="space-y-2.5 md:space-y-3">
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
      <MonthlyPerformance onOpenWeeks={() => setWeeksOpen(true)} />

      {/* Primary financial analysis */}
      <InformationGrid />

      {/* ── Secondary utilities ─────────────────────────────────── */}
      <div className="flex items-center gap-2.5 pt-1.5" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[8px] sm:text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-text">
          More
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Upcoming & recurring — secondary utility, near the bottom */}
      <RecurringSection />

      {/* Export & reports — final section */}
      <ExportReports />

      {/* Weekly breakdown sheet (Year → Week → Day) */}
      {weeksOpen ? <WeeksSheet onClose={() => setWeeksOpen(false)} /> : null}
    </div>
  );
}