"use client";

import type { NextRouter } from "next/router";
import * as Fathom from "fathom-client";
import { posthog } from "posthog-js";
import { useEffect } from "react";

import { installGoogleAnalyticsLoader } from "@/lib/analytics/google-loader";
import { fathomConfig, fathomId, posthogConfig, posthogId } from "@/lib/config";

// extend window with gtag
declare global {
  interface Window {
    gtag?: (
      event: "config" | "event",
      targetId: string,
      config: Record<string, unknown>,
    ) => void;
  }
}

// Google Analytics
export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID;

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export const pageview = (url: string, trackingId: string) => {
  window.gtag?.("config", trackingId, {
    page_path: url,
  });
};

interface GTagEvent {
  action: string;
  category: string;
  label: string;
  value: number;
}

// https://developers.google.com/analytics/devguides/collection/gtagjs/events
export const event = ({ action, category, label, value }: GTagEvent) => {
  window.gtag?.("event", action, {
    event_category: category,
    event_label: label,
    value,
  });
};

export function useSiteAnalytics(
  events?: NextRouter["events"],
  loadGoogle = true,
) {
  useEffect(() => {
    // Google Analytics
    const handleRouteChange = (url: string) => {
      if (GA_TRACKING_ID) {
        pageview(url, GA_TRACKING_ID);
      }
    };

    function onRouteChangeComplete() {
      if (fathomId) {
        Fathom.trackPageview();
      }

      if (posthogId) {
        posthog.capture("$pageview");
      }
    }

    if (fathomId) {
      Fathom.load(fathomId, fathomConfig);
    }

    if (posthogId) {
      posthog.init(posthogId, posthogConfig);
    }

    events?.on("routeChangeComplete", onRouteChangeComplete);
    events?.on("routeChangeComplete", handleRouteChange);

    return () => {
      events?.off("routeChangeComplete", onRouteChangeComplete);
      events?.off("routeChangeComplete", handleRouteChange);
    };
  }, [events]);

  useEffect(() => {
    if (loadGoogle) return installGoogleAnalyticsLoader(GA_TRACKING_ID);
  }, [loadGoogle]);
}

export default function SiteAnalytics() {
  // The isolated shell registers its lightweight Google loader immediately.
  useSiteAnalytics(undefined, false);
  return null;
}
