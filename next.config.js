import path from "node:path";
import { fileURLToPath } from "node:url";

import bundleAnalyzer from "@next/bundle-analyzer";

/* eslint-disable no-process-env */
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const WATCH_IGNORED_PATTERNS = [
  "**/*.log",
  "**/logs/**",
  "**/jack-rag-logs/**",
];

function mergeWatchIgnored(priorIgnored) {
  const base = [...WATCH_IGNORED_PATTERNS];
  if (!priorIgnored) {
    return base;
  }

  const candidateList = Array.isArray(priorIgnored)
    ? priorIgnored
    : [priorIgnored];
  const priorStringGlobs = candidateList.filter(
    (item) => typeof item === "string" && item.length > 0,
  );
  return [...new Set([...priorStringGlobs, ...base])];
}

export default withBundleAnalyzer({
  compress: false,
  staticPageGenerationTimeout: 300,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.notion.so" },
      { protocol: "https", hostname: "notion.so" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "s3.us-west-2.amazonaws.com" },
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
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    config.resolve.alias.react = path.resolve(dirname, "node_modules/react");
    config.resolve.alias["react-dom"] = path.resolve(
      dirname,
      "node_modules/react-dom",
    );

    // config.watchOptions = {
    //   ...config.watchOptions,
    //   ignored: mergeWatchIgnored(config.watchOptions?.ignored),
    // };

    return config;
  },

  // See https://react-tweet.vercel.app/next#troubleshooting
  transpilePackages: ["react-tweet"],
});
/* eslint-enable no-process-env */
