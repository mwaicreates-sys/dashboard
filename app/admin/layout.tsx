"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { SunIcon, MoonIcon } from "@/components/shell/icons";
import { AdminGuard } from "./AdminGuard";
import { AdminBottomNav } from "./AdminBottomNav";
import { SearchDropdown } from "./SearchDropdown";
import { NotificationPopover } from "./NotificationPopover";
import { ShieldIcon } from "./icons";
import { ADMIN_NAV, activeAdminSection } from "./nav";
import { fetchAllBusinessesForSearch, fetchAdminActivity, type ActivityEvent } from "./data";

/**
 * Platform-admin shell. Navigation is exactly four destinations
 * (Dashboard | Businesses | Activity | Profile):
 *  • Desktop — polished top bar (brand + inline nav + search + bell + avatar)
 *  • Mobile  — the same Apple-style pill bottom bar used by the
 *              Business Dashboard (content gets pb-28 clearance so the
 *              fixed bar never overlaps cards, modals, or sheets).
 *
 * Performance: business list (for search) and activity feed (for
 * notifications) are loaded ONCE here and shared with the dropdowns via
 * props — no duplicate fetches when switching admin pages.
 *
 * Uses Inter exclusively (no serif) per the admin UX spec.
 * AdminGuard (DB-verified platform-admin gate) is unchanged.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = activeAdminSection(pathname);
  const { resolvedTheme, toggleTheme } = useTheme();

  const [searchBusinesses, setSearchBusinesses] = useState<
    Array<{ id: string; name: string; ownerEmail: string | null }>
  >([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);

  // Load shared data once — search + notifications both consume this.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [biz, events] = await Promise.all([
        fetchAllBusinessesForSearch(),
        fetchAdminActivity(),
      ]);
      if (!alive) return;
      setSearchBusinesses(biz);
      setActivityEvents(events ?? []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AdminGuard>
      <div className="min-h-screen bg-cream">
        <header className="sticky top-0 z-40 border-b border-border/70 bg-surface/85 backdrop-blur-xl dark:bg-[#16161a]/85">
          <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-3 md:px-4">
            {/* Brand block */}
            <Link href="/admin" className="flex shrink-0 items-center gap-2.5" aria-label="Platform admin dashboard">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue/10 text-blue">
                <ShieldIcon className="h-[18px] w-[18px]" />
              </span>
              <span className="hidden leading-tight sm:block">
                <span className="block font-inter text-[13px] font-bold uppercase tracking-[0.12em] text-primary-text">
                  Platform Admin
                </span>
                <span className="block text-[9px] uppercase tracking-[0.18em] text-muted-text">
                  SaaS Administration
                </span>
              </span>
            </Link>

            {/* Center navigation */}
            <nav
              aria-label="Platform admin"
              className="hidden flex-1 items-center justify-center gap-1 md:flex"
            >
              {ADMIN_NAV.map((item) => {
                const isActive = active === item.section;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue/60 ${
                      isActive
                        ? "bg-blue/10 text-blue"
                        : "text-secondary-text hover:bg-card hover:text-primary-text"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Right controls */}
            <div className="ml-auto flex items-center gap-2 md:ml-0">
              {/* Search — functional dropdown with keyboard nav */}
              <div className="hidden lg:block">
                <SearchDropdown businesses={searchBusinesses} />
              </div>

              {/* Notification bell — real activity feed */}
              <NotificationPopover events={activityEvents} />

              {/* Theme toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-secondary-text transition-colors duration-150 hover:bg-card hover:text-primary-text"
              >
                {resolvedTheme === "dark" ? (
                  <SunIcon className="h-[18px] w-[18px]" />
                ) : (
                  <MoonIcon className="h-[18px] w-[18px]" />
                )}
              </button>

              {/* User avatar — links to the existing Profile page (already the
                  fourth destination on the mobile bottom nav; this desktop
                  control had no destination wired up). */}
              <Link
                href="/admin/profile"
                aria-label="Account menu"
                className="flex items-center gap-1 rounded-xl border border-border p-1 transition-colors duration-150 hover:bg-card"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue/10 text-[11px] font-semibold text-blue">
                  A
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3 text-muted-text"
                  aria-hidden="true"
                >
                  <path d="M6 9.5l6 6 6-6" />
                </svg>
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] px-3 pb-28 pt-4 md:px-4 md:pb-16 md:pt-6">
          {children}
        </main>

        <AdminBottomNav />
      </div>
    </AdminGuard>
  );
}