"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV, activeAdminSection } from "./nav";

/**
 * Mobile-only primary navigation for the platform-admin area.
 * Visually identical to the Business Dashboard bottom nav (same pill,
 * blur, hide-on-scroll behavior) so both modes feel like one product.
 * Hidden on md+ screens where the top bar carries the navigation.
 */
export function AdminBottomNav() {
  const pathname = usePathname();
  const active = activeAdminSection(pathname);

  // Hide while scrolling down; reappear on upward scroll or pause.
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
      aria-label="Admin primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.55rem)] md:hidden"
    >
      <div
        className={`pointer-events-auto flex items-center justify-around gap-1 rounded-full border border-border/60 bg-surface/85 px-1.5 py-1 shadow-[0_6px_18px_rgba(0,0,0,0.08)] backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ease-out dark:border-white/10 dark:bg-[#16161a]/85 ${
          hidden ? "translate-y-[150%] opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        {ADMIN_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.section;
          return (
            <Link
              key={item.section}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`group flex min-w-[60px] select-none flex-col items-center gap-[3px] rounded-xl px-2.5 pb-1 pt-[7px] outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-violet-500/60 active:scale-[0.95] ${
                isActive ? "text-violet-600 dark:text-violet-300" : "text-muted-text hover:text-secondary-text"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.1 : 1.8} />
              <span
                className={`text-[10px] leading-none tracking-wide ${
                  isActive ? "font-semibold" : "font-medium"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}