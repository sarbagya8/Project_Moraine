import { AuthorityPortal } from "@/components/authority/authority-portal";
export default async function Page({ params }: { params: Promise<{ trekkerId: string }> }) {
  return <AuthorityPortal view="trekker" recordId={(await params).trekkerId} />;
}
