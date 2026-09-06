"use client";

import { useState } from "react";
import { BottomNav, TabId } from "./BottomNav";
import { DashboardTab } from "./DashboardTab";
import { EntryTab } from "./EntryTab";
import { ActivityTab } from "./ActivityTab";
import { ProfileTab } from "./ProfileTab";
import { ContextIndicator } from "./ContextIndicator";
import { useDashboardData } from "@/lib/dashboardData";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const TAB_LABELS: Record<TabId, string> = {
  dashboard: "Dashboard",
  entry: "Entry",
  activity: "Activity",
  profile: "Profile",
};

/**
 * App shell — exactly four primary sections with a balanced three-zone
 * desktop header. The header distributes identity, subtle business context,
 * and workspace/account controls across the viewport so the layout never
 * feels left-heavy or artificially narrow.
 */
export function Shell() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const { selectedYear, setSelectedYear } = useDashboardData();

  const changeYear = (delta: 1 | -1) => {
    setSelectedYear(selectedYear + delta);
  };

  return (
    <>
      {/* Three-zone header */}
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[36px] items-center justify-between gap-2 py-2.5 md:min-h-[40px] md:gap-4 md:py-3">
          {/* LEFT — tab identity + year navigation */}
          <div className="flex items-center gap-2 md:gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-text">
                {TAB_LABELS[tab]}
              </p>
              {tab === "dashboard" && (
                <div className="mt-0.5 flex items-center gap-1.5 md:mt-1 md:gap-2">
                  <button
                    type="button"
                    onClick={() => changeYear(-1)}
                    aria-label="Previous year"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-secondary-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60 active:scale-95"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <span className="text-xl font-bold leading-none tracking-tight text-primary-text">
                    {selectedYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => changeYear(1)}
                    aria-label="Next year"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-secondary-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60 active:scale-95"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* CENTER — subtle business context */}
          <div className="hidden md:flex items-center">
            {tab === "dashboard" && (
              <p className="text-xs text-muted-text">January — December</p>
            )}
          </div>

          {/* RIGHT — workspace + account controls */}
          <div className="flex items-center gap-3">
            <ContextIndicator />
          </div>
        </div>
      </div>

      {/* Tab content */}
      <main className="flex-1">
        <div
          key={tab}
          className="tab-enter mx-auto w-full max-w-[1440px] px-3 pb-24 pt-2.5 sm:px-4 md:px-6 md:pb-12 md:pt-4 lg:px-8"
        >
          {tab === "dashboard" && <DashboardTab />}
          {tab === "entry" && <EntryTab />}
          {tab === "activity" && <ActivityTab />}
          {tab === "profile" && <ProfileTab />}
        </div>
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </>
  );
}
