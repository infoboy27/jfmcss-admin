import type { Metadata } from "next";
import PublicCsat from "@/components/PublicCsat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Encuesta · JFMCSS", robots: { index: false, follow: false } };

export default async function CsatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicCsat token={token} />;
}
