import type { Metadata } from "next";

import { Experience } from "@/components/pm-intelligence-world/Experience";
import { worldContent } from "@/content/pm-intelligence-world/content";
import { host } from "@/lib/config";

const title =
  "PM Intelligence System — Interactive introduction | Jack H. Park";
export const metadata: Metadata = {
  title,
  description: worldContent.purpose,
  robots: { index: false, follow: false },
  alternates: { canonical: `${host}/experiences/pm-intelligence` },
  openGraph: { title, description: worldContent.purpose },
};

export default function PmIntelligencePage() {
  return <Experience content={worldContent} />;
}
