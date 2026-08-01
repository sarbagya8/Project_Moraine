import type { Metadata } from "next";
import { RescueView } from "@/components/rescue-view";

export const metadata: Metadata = {
  title: "Rescue Passport",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function RescuePage({
  params,
}: {
  params: Promise<{ sosId: string }>;
}) {
  const { sosId } = await params;
  return <RescueView sosId={sosId} />;
}
