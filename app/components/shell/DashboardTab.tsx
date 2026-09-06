"use client";

import { useRouter } from "next/navigation";
import { KPIGaugeGroup } from "@/components/CircularKPI";
import { NetWorthGrowth, IncomeStreamStack } from "@/components/HeaderCharts";
import { MonthlyIncomeOutflow } from "@/components/MonthlyIncomeOutflow";
import { IncomeSplit } from "@/components/IncomeSplit";
import { OutflowTypes } from "@/components/OutflowTypes";
import { CumulativeGrowth } from "@/components/CumulativeGrowth";
import { InformationGrid } from "@/components/InformationGrid";
import { MonthlyPerformance } from "./MonthlyPerformance";
import { RecurringSection } from "./RecurringSection";
import { ExportReports } from "./ExportReports";

/**
 * Dashboard — financial analysis for one calendar year.
 *
 * Vertical flow (single full-width column, normal page scroll):
 *   Header (rendered by shell)
 *   Key metrics                 — full-width band
 *   Net Worth Growth | Income Stream
 *   Income vs Outflow | Income Split
 *   Outflow Types | Cumulative Growth
 *   Monthly Performance         — full-width
 *   Top 20 Outflow | Top 20 Spendings
 *   Upcoming & Recurring | Export & Reports
 *
 * Each chart sits in its own compact card; there is no persistent sidebar,
 * no 65/35 split, and no 4-column overview. Charts use independent card
 * sizing so a long list (e.g. Upcoming) cannot stretch unrelated cards.
 */
const card =
  "rounded-2xl border border-border bg-surface p-3 sm:p-4 flex flex-col";

export function DashboardTab() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      {/* Key metrics — full-width compact band */}
      <section className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
        <p className="mb-2 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
          Key metrics
        </p>
        <KPIGaugeGroup />
      </section>

      {/* Row 1 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={card}>
          <NetWorthGrowth />
        </div>
        <div className={card}>
          <IncomeStreamStack />
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={card}>
          <MonthlyIncomeOutflow />
        </div>
        <div className={card}>
          <IncomeSplit />
        </div>
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={card}>
          <OutflowTypes />
        </div>
        <div className={card}>
          <CumulativeGrowth />
        </div>
      </div>

      {/* Monthly Performance — full width */}
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
