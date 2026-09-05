import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/serverAuth";
import { WorkspaceSelector } from "./WorkspaceSelector";

export const metadata: Metadata = {
  title: "Choose a workspace — Budget",
  description: "Select which business workspace you are entering.",
};

export default async function WorkspacesPage() {
  // Session gate (the proxy already enforces this — defense in depth).
  const user = await getServerUser();
  if (!user) redirect("/login");

  return <WorkspaceSelector />;
}