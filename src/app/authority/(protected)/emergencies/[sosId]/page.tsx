import { AuthorityPortal } from "@/components/authority/authority-portal";
export default async function Page({ params }: { params: Promise<{ sosId: string }> }) {
  return <AuthorityPortal view="emergency" recordId={(await params).sosId} />;
}
