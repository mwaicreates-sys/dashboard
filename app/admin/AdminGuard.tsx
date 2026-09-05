"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { checkPlatformAdmin } from "@/lib/platformAdmin";

/**
 * Client-side authorization gate for /admin (defense in depth).
 *
 * Three DB-backed layers protect this area:
 *   1. proxy.ts — unauthenticated requests never reach /admin at all
 *      (the Supabase session lives in cookies via @supabase/ssr, so the
 *      edge proxy CAN and does evaluate the session).
 *   2. This gate — re-verifies platform-admin status with the DATABASE
 *      (current_is_platform_admin RPC, migration 007) on mount;
 *      non-admins are routed to "/" which re-routes them to their own
 *      workspace or the workspace selector. Direct URL access included.
 *   3. RLS — every admin page only renders data migration 007 exposes
 *      to platform admins. Nothing authorizes from the UI, localStorage,
 *      or the business role.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "denied" | "granted">("checking");

  useEffect(() => {
    let alive = true;
    checkPlatformAdmin().then((ok) => {
      if (!alive) return;
      if (ok) {
        setState("granted");
      } else {
        setState("denied");
        router.replace("/");
      }
    });
    return () => {
      alive = false;
    };
  }, [router]);

  if (state !== "granted") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="rounded-2xl border border-border bg-card px-6 py-5 text-center shadow-sm">
          <p className="font-inter text-lg font-bold text-primary-text">
            {state === "checking" ? "Verifying platform access…" : "Not authorized"}
          </p>
          <p className="mt-1 text-xs text-muted-text">
            {state === "checking"
              ? "Checking your platform-admin role with the server."
              : "This area is restricted to platform administrators. Redirecting to your workspace…"}
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}