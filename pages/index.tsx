import Head from "next/head";

import { LandingPage } from "@/components/landing/LandingPage";
import { hero } from "@/content/landing";
import * as config from "@/lib/config";

// The studio landing page now owns `/` (the Notion studio home moved to
// /studio — see pages/studio.tsx and lib/map-page-url.ts).
export default function Home() {
  return (
    <>
      <Head>
        <title>{`${config.name} — ${hero.headline}`}</title>
        <meta name="description" content={hero.positioning} />
        <link rel="canonical" href={`${config.host}/`} />
        <meta property="og:title" content={config.name} />
        <meta property="og:description" content={hero.positioning} />
        <meta property="og:url" content={`${config.host}/`} />
        <meta property="og:image" content={`${config.host}/og/landing.png`} />
        <meta property="og:image:width" content="2400" />
        <meta property="og:image:height" content="1260" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <LandingPage />
    </>
  );
}
