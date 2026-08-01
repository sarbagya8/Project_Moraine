import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AuthorityShell } from "@/components/authority/authority-shell";
import { currentSession } from "@/lib/portal-auth";

export default async function ProtectedAuthorityLayout({ children }: { children: ReactNode }) {
  if ((await currentSession())?.role !== "authority") redirect("/authority/login");
  return <AuthorityShell>{children}</AuthorityShell>;
}
