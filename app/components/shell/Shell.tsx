"use client";

import { useState } from "react";
import { BottomNav, TabId } from "./BottomNav";
import { DashboardTab } from "./DashboardTab";
import { EntryTab } from "./EntryTab";
import { ActivityTab } from "./ActivityTab";
import { ProfileTab } from "./ProfileTab";
import { ContextIndicator } from "./ContextIndicator";
import { RecurringSection } from "./RecurringSection";
import { useDashboardData } from "@/lib/dashboardData";
import { ChevronLeftIcon, ChevronRightIcon, BellIcon } from "./icons";

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
  const [showReminder, setShowReminder] = useState(false);
  const { selectedYear, setSelectedYear, upcomingRecurring } = useDashboardData();

  const changeYear = (delta: 1 | -1) => {
    setSelectedYear(selectedYear + delta);
  };

  const upcomingCount = upcomingRecurring.length;

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Three-zone header */}
      <header className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
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
          <div className="hidden items-center md:flex">
            {tab === "dashboard" && (
              <p className="text-xs text-muted-text">January — December</p>
            )}
          </div>

          {/* RIGHT — dashboard reminder + workspace/account controls */}
          <div className="flex items-center gap-3">
            {tab === "dashboard" && (
              <button
                type="button"
                onClick={() => setShowReminder(true)}
                aria-label={`${upcomingCount} upcoming scheduled ${
                  upcomingCount === 1 ? "entry" : "entries"
                }`}
                className="indicator-trigger flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium text-secondary-text hover:bg-secondary-text/10 hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60 active:scale-95"
              >
                <BellIcon className="h-3.5 w-3.5" />
                <span className="tabular-nums">{upcomingCount}</span>
                <span className="hidden xs:inline">Upcoming</span>
              </button>
            )}
            <ContextIndicator />
          </div>
        </div>
      </header>

      {/* Tab content */}
      <main className="flex-1 w-full min-h-0">
        <div
          key={tab}
          className="tab-enter mx-auto w-full max-w-[1440px] px-3 pb-28 pt-2.5 sm:px-4 md:px-6 md:pb-20 md:pt-4 lg:px-8"
        >
          {tab === "dashboard" && <DashboardTab />}
          {tab === "entry" && <EntryTab />}
          {tab === "activity" && <ActivityTab />}
          {tab === "profile" && <ProfileTab />}
        </div>
      </main>

      {tab === "dashboard" && showReminder && (
        <button
          type="button"
          onClick={() => setShowReminder(false)}
          aria-label="Close upcoming"
          className="fixed inset-0 z-[99] flex items-center justify-center bg-black/20 p-2 backdrop-blur-[1px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl rounded-[28px] border border-border bg-surface pb-4 shadow-xl sm:my-8 sm:max-w-xl"
          >
            <button
              type="button"
              onClick={() => setShowReminder(false)}
              aria-label="Close"
              className="absolute top-2 right-2 rounded-full p-1 text-secondary-text hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
            >
              ✕
            </button>
            <RecurringSection />
          </div>
        </button>
      )}

      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
