"use client";

import { useRouter } from "next/navigation";
import { KPIGaugeGroup } from "@/components/CircularKPI";
import { VisualizationGrid } from "@/components/VisualizationGrid";
import { InformationGrid } from "@/components/InformationGrid";
import { MonthlyPerformance } from "./MonthlyPerformance";
import { ExportReports } from "./ExportReports";

/**
 * Dashboard — financial analysis for one calendar year.
 *
 * Vertical flow (single full-width column, normal page scroll):
 *   Header (rendered by shell)
 *   Key metrics                 — full-width band
 *   Net Worth Growth | Income Stream | Monthly Income vs Outflow
 *   Income Split | Outflow Types | Cumulative Growth
 *   Monthly Performance         — full-width
 *   Top 20 Outflow | Top 20 Spendings
 *   Export & Reports   — full width (Upcoming & Recurring accessed via header notification)
 *
 * Each chart sits in its own compact card (rendered by VisualizationGrid,
 * which provides the original clickable card styling); there is no
 * persistent right sidebar. Charts use independent card sizing so a long
 * list (e.g. Upcoming) cannot stretch unrelated cards.
 */
const SECTION_GAP = "gap-3";

export function DashboardTab() {
  const router = useRouter();

  return (
    <div className={`flex flex-col ${SECTION_GAP}`}>
      {/* Key metrics — full-width compact band */}
      <section className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
        <p className="mb-2 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
          Key metrics
        </p>
        <KPIGaugeGroup />
      </section>

      {/* Six charts as two 3-column desktop rows (VisualizationGrid handles the grid) */}
      <VisualizationGrid />

      {/* Monthly Performance — full width */}
      <MonthlyPerformance onOpenWeeks={() => router.push("/weeks")} />

      {/* Top 20 Outflow | Top 20 Spendings */}
      <InformationGrid />

      {/* Export & reports — full width (upcoming accessed via header notification) */}
      <ExportReports />
    </div>
  );
}
