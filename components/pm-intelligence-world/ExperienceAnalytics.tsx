"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { scheduleExperienceAnalytics } from "@/lib/analytics/experience-loader";
import { installGoogleAnalyticsLoader } from "@/lib/analytics/google-loader";

const SiteAnalytics = dynamic(
  () => import("@/components/analytics/SiteAnalytics"),
  {
    ssr: false,
  },
);

export function ExperienceAnalytics() {
  const [loadSdk, setLoadSdk] = useState(false);
  useEffect(() => scheduleExperienceAnalytics(() => setLoadSdk(true)), []);
  useEffect(
    () => installGoogleAnalyticsLoader(process.env.NEXT_PUBLIC_GA_ID),
    [],
  );
  return loadSdk ? <SiteAnalytics /> : null;
}
