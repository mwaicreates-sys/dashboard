"use client";

import { useRef, useState } from "react";
import { KPIGaugeGroup } from "@/components/CircularKPI";
import { NetWorthGrowth, IncomeStreamStack } from "@/components/HeaderCharts";
import { VisualizationGrid } from "@/components/VisualizationGrid";
import { InformationGrid } from "@/components/InformationGrid";
import { MonthlyPerformance } from "./MonthlyPerformance";
import { RecurringSection } from "./RecurringSection";
import { ExportReports } from "./ExportReports";
import { WeeksSheet } from "./WeeksSheet";
import { useDashboardData } from "@/lib/dashboardData";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

/**
 * Dashboard — financial analysis for one calendar year.
 * Hierarchy: Year context → KPIs → Charts → Monthly income → Analysis →
 * (secondary) Upcoming & recurring → Export & reports.
 */
export function DashboardTab() {
  const { selectedYear, setSelectedYear } = useDashboardData();
  const [weeksOpen, setWeeksOpen] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const startX = useRef<number | null>(null);

  const changeYear = (delta: 1 | -1) => {
    setDir(delta);
    setSelectedYear(selectedYear + delta);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (dx <= -48) changeYear(1);
    else if (dx >= 48) changeYear(-1);
    startX.current = null;
  };

  return (
    <div className="space-y-3">
      {/* Year context — horizontal swipe / arrow navigation, no dropdown */}
      <header
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="select-none"
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-text">
          Dashboard
        </p>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => changeYear(-1)}
            aria-label="Previous year"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-secondary-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60 active:scale-95"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <h1
            key={selectedYear}
            className={`min-w-[3ch] text-center font-serif text-[3rem] font-semibold leading-none text-primary-text md:text-6xl ${
              dir === 1 ? "year-enter-right" : "year-enter-left"
            }`}
          >
            {selectedYear}
          </h1>
          <button
            type="button"
            onClick={() => changeYear(1)}
            aria-label="Next year"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-secondary-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60 active:scale-95"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1.5 pl-[52px] text-xs text-secondary-text md:pl-[60px]">
          January — December · swipe or tap to change year
        </p>
      </header>

      {/* Primary KPIs */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
            At a glance
          </p>
          <KPIGaugeGroup />
        </div>
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 md:grid-cols-2">
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
      <div className="flex items-center gap-3 pt-2" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-text">
          Scheduled &amp; exports
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