import { redirect } from "next/navigation";
import { getServerIsPlatformAdmin, getServerMemberships, getServerUser } from "@/lib/serverAuth";

// ============================================================
// Server-side gate for every business workspace surface
// (/(workspace)/dashboard, /(workspace)/goals, … — the URLs are
// unchanged by the route group).
//
// Layered on top of proxy.ts (which guarantees a valid session):
//   • signed out                     → /login (defense in depth)
//   • business user, no memberships  → /workspaces (explicit empty
//     state — no workspace is ever created or assumed here)
//   • platform admin                 → allowed through, because an
//     admin may ENTER a business workspace only through the
//     explicit "view workspace" flow — which the client bootstrap
//     re-verifies against the DB before honoring, and which the
//     ContextIndicator labels "Platform Admin — Viewing" the whole
//     time. The router never PUSHES an admin into a workspace.
// ============================================================

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();
  if (!user) redirect("/login");

  if (!(await getServerIsPlatformAdmin())) {
    const memberships = await getServerMemberships(user.id);
    if (!memberships || memberships.length === 0) {
      redirect("/workspaces");
    }
  }

  return <>{children}</>;
}