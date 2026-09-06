import type { Metadata } from "next";
import PublicProposal from "@/components/PublicProposal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Propuesta · JFMCSS", robots: { index: false, follow: false } };

export default async function ProposalLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicProposal token={token} />;
}
