import type { Metadata } from "next";
import { Shell } from "@/components/shell/Shell";

export const metadata: Metadata = {
  title: "Dashboard — Budget",
  description: "Your business workspace, year at a glance.",
};

export default function DashboardPage() {
  return <Shell />;
}