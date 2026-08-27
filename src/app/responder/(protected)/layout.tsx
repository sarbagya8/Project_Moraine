import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AuthorityShell } from "@/components/authority/authority-shell";
import { currentSession } from "@/lib/portal-auth";

export default async function ResponderLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/responder/login");
  if (session.role !== "authority") redirect("/responder/login");
  return <AuthorityShell>{children}</AuthorityShell>;
}
