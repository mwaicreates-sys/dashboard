"use client";

import { useState } from "react";
import { BottomNav, TabId } from "./BottomNav";
import { DashboardTab } from "./DashboardTab";
import { EntryTab } from "./EntryTab";
import { ActivityTab } from "./ActivityTab";
import { ProfileTab } from "./ProfileTab";

/**
 * App shell — exactly four primary sections (Dashboard / Entry / Activity /
 * Profile) with a slim floating glass bottom bar. Year selection and the
 * Weeks drill-down live inside Dashboard, never in primary navigation.
 */
export function Shell() {
  const [tab, setTab] = useState<TabId>("dashboard");

  return (
    <>
      <main className="flex-1">
        <div
          key={tab}
          className="tab-enter mx-auto w-full max-w-[1400px] px-3 pb-28 pt-3 md:px-4 md:pb-12 md:pt-4"
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
