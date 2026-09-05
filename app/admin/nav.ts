import { ActivityIcon, GridIcon, ProfileIcon } from "@/components/shell/icons";
import { BuildingIcon } from "./icons";

export type AdminSection = "dashboard" | "businesses" | "activity" | "profile";

export interface AdminNavItem {
  section: AdminSection;
  href: string;
  label: string;
  icon: typeof GridIcon;
  match: (pathname: string) => boolean;
}

/** The four primary platform-admin destinations. */
export const ADMIN_NAV: AdminNavItem[] = [
  {
    section: "dashboard",
    href: "/admin",
    label: "Dashboard",
    icon: GridIcon,
    match: (p) => p === "/admin",
  },
  {
    section: "businesses",
    href: "/admin/businesses",
    label: "Businesses",
    icon: BuildingIcon,
    match: (p) => p.startsWith("/admin/businesses"),
  },
  {
    section: "activity",
    href: "/admin/activity",
    label: "Activity",
    icon: ActivityIcon,
    match: (p) => p === "/admin/activity",
  },
  {
    section: "profile",
    href: "/admin/profile",
    label: "Profile",
    icon: ProfileIcon,
    match: (p) => p === "/admin/profile",
  },
];

export const activeAdminSection = (pathname: string): AdminSection | null =>
  ADMIN_NAV.find((item) => item.match(pathname))?.section ?? null;