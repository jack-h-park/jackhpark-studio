"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

import { installGoogleAnalyticsLoader } from "@/lib/analytics/google-loader";

const SiteAnalytics = dynamic(
  () => import("@/components/analytics/SiteAnalytics"),
  {
    ssr: false,
  },
);

export function ExperienceAnalytics() {
  useEffect(
    () => installGoogleAnalyticsLoader(process.env.NEXT_PUBLIC_GA_ID),
    [],
  );
  return <SiteAnalytics />;
}
