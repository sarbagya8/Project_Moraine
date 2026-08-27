import { CaseDetails } from "@/components/responder/case-details";

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  return <CaseDetails caseId={(await params).caseId} />;
}
