import Head from "next/head";

import { LandingPage } from "@/components/landing/LandingPage";
import { hero } from "@/content/landing";
import * as config from "@/lib/config";

// Temporary route: becomes `/` once the Notion root moves to /work
// (owner decision pending — see docs/ui/landing-storyboard.md §7).
export default function Landing() {
  return (
    <>
      <Head>
        <title>{`${config.name} — ${hero.headline}`}</title>
        <meta name="description" content={hero.positioning} />
        <meta property="og:title" content={config.name} />
        <meta property="og:description" content={hero.positioning} />
        <meta property="og:image" content={`${config.host}/og/landing.png`} />
        <meta property="og:image:width" content="2400" />
        <meta property="og:image:height" content="1260" />
        <meta name="twitter:card" content="summary_large_image" />
        {/* Keep the temporary route out of the index until it becomes `/`. */}
        <meta name="robots" content="noindex" />
      </Head>
      <LandingPage />
    </>
  );
}
