"use client";

import { useEffect, useState } from "react";
import { GridIcon, EntryIcon, ActivityIcon, ProfileIcon } from "./icons";

export type TabId = "dashboard" | "entry" | "activity" | "profile";

const TABS: Array<{ id: TabId; label: string; icon: typeof GridIcon; description: string }> = [
  { id: "dashboard", label: "Dashboard", icon: GridIcon, description: "Financial overview" },
  { id: "entry", label: "Entry", icon: EntryIcon, description: "Record money" },
  { id: "activity", label: "Activity", icon: ActivityIcon, description: "Day-by-day activity tracking" },
  { id: "profile", label: "Profile", icon: ProfileIcon, description: "Profile and settings" },
];

export function BottomNav({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  // Hide while scrolling down; reappear on upward scroll or when scrolling
  // stops. Always visible near the very top of the page.
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      if (y < 60) setHidden(false);
      else if (dy > 6) setHidden(true);
      else if (dy < -6) setHidden(false);
      lastY = y;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setHidden(false), 900);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.55rem)]"
    >
      <div
        className={`pointer-events-auto flex items-center justify-around gap-1 rounded-full border border-border/60 bg-surface/85 px-1.5 py-1 shadow-[0_6px_18px_rgba(0,0,0,0.08)] backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ease-out dark:border-white/10 dark:bg-[#16161a]/85 ${
          hidden ? "translate-y-[150%] opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={isActive ? "page" : undefined}
              aria-label={tab.description}
              className={`group flex min-w-[60px] select-none flex-col items-center gap-[3px] rounded-xl px-2.5 pb-1 pt-[7px] outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-blue/60 active:scale-[0.95] ${
                isActive ? "text-blue" : "text-muted-text hover:text-secondary-text"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.1 : 1.8} />
              <span
                className={`text-[10px] leading-none tracking-wide ${
                  isActive ? "font-semibold" : "font-medium"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}