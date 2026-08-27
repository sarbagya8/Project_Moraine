import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RescueView } from "@/components/rescue-view";
import { currentSession } from "@/lib/portal-auth";

export const metadata: Metadata = {
  title: "Emergency Response Brief",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function RescuePage({
  params,
}: {
  params: Promise<{ sosId: string }>;
}) {
  const { sosId } = await params;
  const session = await currentSession();
  if (!session) redirect("/responder/login");
  return <RescueView sosId={sosId} />;
}
