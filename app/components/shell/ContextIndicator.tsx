"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDashboardData } from "@/lib/dashboardData";
import {
  checkPlatformAdmin,
  clearAdminViewing,
  exitAdminViewing,
  getAdminViewing,
} from "@/lib/platformAdmin";

type Variant =
  | { kind: "admin-viewing"; businessName: string }
  | { kind: "platform-admin" }
  | { kind: "business"; name: string; role: string }
  | { kind: "local" };

/**
 * Persistent account/context indicator for the workspace shell.
 * Answers, at a glance, WHO is operating and IN WHICH CONTEXT:
 *   • PLATFORM ADMIN / SaaS Administration      (admin, own context)
 *   • PLATFORM ADMIN — Viewing: <Business> ✕    (admin inspecting a tenant)
 *   • <Business Name> / role · Business Workspace (business user)
 *   • Local workspace                            (signed out / local-only)
 *
 * The admin/business decision always comes from the DATABASE
 * (current_is_platform_admin RPC) — never from the UI or localStorage.
 */
export function ContextIndicator() {
  const { activeBusiness } = useDashboardData();
  const [variant, setVariant] = useState<Variant>({ kind: "local" });

  useEffect(() => {
    let alive = true;
    (async () => {
      const viewing = getAdminViewing();
      if (viewing) {
        // Stale marker (business was switched through the switcher) → drop it.
        if (activeBusiness && activeBusiness.id !== viewing.businessId) {
          clearAdminViewing();
        } else {
          if (alive) {
            setVariant({
              kind: "admin-viewing",
              businessName: viewing.businessName || activeBusiness?.name || "Business",
            });
          }
          return;
        }
      }
      const isAdmin = await checkPlatformAdmin();
      if (!alive) return;
      if (isAdmin) {
        setVariant({ kind: "platform-admin" });
      } else if (activeBusiness) {
        setVariant({ kind: "business", name: activeBusiness.name, role: activeBusiness.role });
      } else {
        setVariant({ kind: "local" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeBusiness]);

  if (variant.kind === "admin-viewing") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-blue/40 bg-blue/10 px-2.5 py-1.5">
        <span className="hidden text-[9px] font-semibold uppercase tracking-[0.14em] text-blue sm:block">
          Platform Admin
        </span>
        <span className="max-w-[150px] truncate text-[11px] font-medium text-primary-text sm:max-w-[240px]">
          Viewing: {variant.businessName}
        </span>
        <button
          type="button"
          onClick={() => exitAdminViewing()}
          title="Exit admin viewing and return to the platform-admin area"
          className="rounded-md border border-blue/40 px-2 py-0.5 text-[10px] font-semibold text-blue transition-colors hover:bg-blue/15"
        >
          Exit
        </button>
      </div>
    );
  }

  if (variant.kind === "platform-admin") {
    return (
      <Link
        href="/admin"
        title="Open the platform-admin area"
        className="flex items-center gap-2 rounded-xl border border-blue/30 bg-blue/[0.07] px-2.5 py-1.5 transition-colors hover:bg-blue/[0.12]"
      >
        <span className="leading-tight">
          <span className="block text-[11px] font-semibold text-primary-text">PLATFORM ADMIN</span>
          <span className="block text-[9px] uppercase tracking-[0.14em] text-blue">
            SaaS Administration
          </span>
        </span>
      </Link>
    );
  }

  if (variant.kind === "business") {
    return (
      <div className="min-w-0 rounded-xl border border-border bg-card px-2.5 py-1.5 leading-tight">
        <p className="max-w-[130px] truncate text-[11px] font-semibold text-primary-text sm:max-w-[220px]">
          {variant.name}
        </p>
        <p className="text-[9px] uppercase tracking-[0.14em] text-muted-text">
          {variant.role} · Business Workspace
        </p>
      </div>
    );
  }

  return (
    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-text">Local workspace</p>
  );
}