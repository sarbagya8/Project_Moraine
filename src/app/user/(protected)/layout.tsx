import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/portal-auth";

export default async function UserLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/user/login");
  if (session.role !== "trekker") redirect("/user/login");
  return children;
}
