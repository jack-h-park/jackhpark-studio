import Head from "next/head";

import { Experience } from "@/components/pm-intelligence-world/Experience";
import { worldContent } from "@/content/pm-intelligence-world/content";
import { host } from "@/lib/config";
import { geistMono, geistSans } from "@/lib/fonts";

export default function PmIntelligencePage() {
  return (
    <>
      <Head>
        <title>
          PM Intelligence System — Interactive introduction | Jack H. Park
        </title>
        <meta name="description" content={worldContent.purpose} />
        <meta name="robots" content="noindex,nofollow" />
        <link rel="canonical" href={`${host}/experiences/pm-intelligence`} />
        <meta
          property="og:title"
          content="PM Intelligence System — Interactive introduction | Jack H. Park"
        />
        <meta property="og:description" content={worldContent.purpose} />
      </Head>
      <div className={`${geistSans.variable} ${geistMono.variable}`}>
        <Experience content={worldContent} />
      </div>
    </>
  );
}
