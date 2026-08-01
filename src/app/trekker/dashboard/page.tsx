import { redirect } from "next/navigation";
import { TrekkerPortal } from "@/components/trekker/trekker-portal";
import { currentSession } from "@/lib/portal-auth";

export default async function TrekkerDashboardPage() {
  if ((await currentSession())?.role !== "trekker") redirect("/trekker/login");
  return <TrekkerPortal />;
}
