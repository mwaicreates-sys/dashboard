"use client";

import { useRouter } from "next/navigation";
import { WeeksTab } from "@/components/shell/WeeksTab";
import { ContextIndicator } from "@/components/shell/ContextIndicator";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/shell/icons";
import { useDashboardData } from "@/lib/dashboardData";

export default function WeeksPage() {
  const router = useRouter();
  const { selectedYear, setSelectedYear } = useDashboardData();

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-3 py-3 sm:px-4 md:px-6 md:py-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            aria-label="Back to dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-secondary-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-text">Weekly</p>
            <div className="mt-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedYear(selectedYear - 1)}
                aria-label="Previous year"
                className="flex h-8 w-8 items-center justify-center rounded-full text-secondary-text hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="text-xl font-bold leading-none tracking-tight text-primary-text">{selectedYear}</span>
              <button
                type="button"
                onClick={() => setSelectedYear(selectedYear + 1)}
                aria-label="Next year"
                className="flex h-8 w-8 items-center justify-center rounded-full text-secondary-text hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <ContextIndicator />
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-3 pb-12 pt-1 sm:px-4 md:px-6 md:pt-2 lg:px-8">
        <WeeksTab key={selectedYear} />
      </main>
    </div>
  );
}
