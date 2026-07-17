import path from "node:path";
import { fileURLToPath } from "node:url";

import bundleAnalyzer from "@next/bundle-analyzer";

/* eslint-disable no-process-env */
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withBundleAnalyzer({
  compress: false,
  staticPageGenerationTimeout: 300,
  devIndicators: false,
  experimental: {
    externalDir: true,
    // Save and restore scroll position on back/forward navigation (Pages Router).
    // Without this, Next.js always scrolls to the top on every navigation,
    // including browser back — making it feel like a hard refresh.
    scrollRestoration: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.notion.so" },
      { protocol: "https", hostname: "notion.so" },
      { protocol: "https", hostname: "img.notionusercontent.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "*.amazonaws.com" },
    ],
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  env: {
    LOG_GLOBAL_LEVEL: process.env.LOG_GLOBAL_LEVEL,
    LOG_RAG_LEVEL: process.env.LOG_RAG_LEVEL,
    LOG_INGESTION_LEVEL: process.env.LOG_INGESTION_LEVEL,
    LOG_NOTION_LEVEL: process.env.LOG_NOTION_LEVEL,
    LOG_LLM_LEVEL: process.env.LOG_LLM_LEVEL,
    APP_ENV: process.env.APP_ENV,
  },

  webpack: (config) => {
    // Workaround for ensuring that `react` and `react-dom` resolve correctly
    // when using a locally-linked version of `react-notion-x`.
    // @see https://github.com/vercel/next.js/issues/50391
    //
    // Also aliasing `react/jsx-runtime` and `react/jsx-dev-runtime` to prevent
    // the Next.js 15 DevTools from picking up a separate React instance, which
    // manifests as: "Cannot read properties of null (reading 'useContext')".
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    config.resolve.alias.react = path.resolve(dirname, "node_modules/react");
    config.resolve.alias["react-dom"] = path.resolve(
      dirname,
      "node_modules/react-dom",
    );
    config.resolve.alias["react/jsx-runtime"] = path.resolve(
      dirname,
      "node_modules/react/jsx-runtime",
    );
    config.resolve.alias["react/jsx-dev-runtime"] = path.resolve(
      dirname,
      "node_modules/react/jsx-dev-runtime",
    );
    config.resolve.alias["react-pdf"] = path.resolve(
      dirname,
      "node_modules/react-pdf",
    );

    return config;
  },

  // See https://react-tweet.vercel.app/next#troubleshooting
  transpilePackages: ["react-tweet"],

  // Exclude large native binaries and dev-only cache files from serverless function bundles.
  // canvas is an optional jsdom dep we no longer use (see lib/rag/fetch-favicon.ts).
  // webpack cache files should never ship to Lambda.
  // NOTE: sharp linux binaries must NOT be excluded — lqip-modern (via lib/notion.ts) depends on
  // sharp at runtime and excluding its native module causes a Lambda crash.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/canvas/**",
      ".next/cache/webpack/**",
    ],
  },

  // lib/get-site-map.ts reads this at runtime via a computed path, which file
  // tracing cannot discover statically. Without this the sitemap crawled at
  // build time never reaches the serverless bundle and getSiteMap() fails at
  // runtime (it refuses to re-crawl inside a function).
  outputFileTracingIncludes: {
    "*": [".next/cache/notion-sitemap.json"],
  },
});
/* eslint-enable no-process-env */
