import { redirect } from "next/navigation";
import { getServerIsPlatformAdmin, getServerMemberships, getServerUser } from "@/lib/serverAuth";

// ============================================================
// "/" — the entry router (server-rendered, DATABASE-decided).
//
//   signed out               → /login      (proxy.ts enforces; kept
//                                             here as defense in depth)
//   platform admin           → /admin      (profiles.is_platform_admin,
//                                             via current_is_platform_admin RPC)
//   exactly one membership   → /dashboard  (business_members → business_id)
//   zero or several          → /workspaces (explicit selector — never
//                                             auto-pick, never auto-create)
//
// The root layout still mounts around this page, but it renders no
// UI of its own: every visitor is routed to the POV their database
// state authorizes.
// ============================================================

export default async function Home() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  // A business owner/admin/member is NOT a platform admin — this is
  // decided solely by the database flag, never by membership.
  if (await getServerIsPlatformAdmin()) redirect("/admin");

  const memberships = await getServerMemberships(user.id);
  if (memberships && memberships.length === 1) redirect("/dashboard");

  redirect("/workspaces");
}
