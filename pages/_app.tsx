// global styles shared across the entire site
import "../styles/global.css";

// this might be better for dark mode
// import 'prismjs/themes/prism-okaidia.css'
import type { AppProps } from "next/app";
import * as Fathom from "fathom-client";
import { useRouter } from "next/router";
import { posthog } from "posthog-js";
import React, { useEffect } from "react";

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

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

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

    router.events.on("routeChangeComplete", onRouteChangeComplete);
    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", onRouteChangeComplete);
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  return <Component {...pageProps} />;
}
