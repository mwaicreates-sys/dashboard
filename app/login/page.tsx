import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/serverAuth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in — Budget",
  description: "Sign in to your business workspace.",
};

export default async function LoginPage() {
  const user = await getServerUser();
  if (user) redirect("/");

  return <LoginForm />;
}