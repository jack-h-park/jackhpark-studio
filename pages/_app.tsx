// global styles shared across the entire site
import "../styles/global.css";
import "@/styles/ai-design-system.css";

// this might be better for dark mode
// import 'prismjs/themes/prism-okaidia.css'
import type { AppProps } from "next/app";
import * as Fathom from "fathom-client";
import { useRouter } from "next/router";
import { posthog } from "posthog-js";
import React, { useEffect } from "react";

import { ChatPromotionSessionProvider } from "@/components/chat/context/ChatPromotionSessionContext";
import { DarkModeProvider } from "@/components/DarkModeProvider";
import { NavigationProgress } from "@/components/NavigationProgress";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fathomConfig, fathomId, notionPolishProfile, posthogConfig, posthogId } from "@/lib/config";

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

  // Apply the notion-polish-* body class once for the entire session.
  // This must live here (not inside NotionPage) so it is never removed
  // during client-side page transitions — removing it mid-navigation is
  // what caused the full-screen white flash on back navigation.
  useEffect(() => {
    document.body.classList.add(`notion-polish-${notionPolishProfile}`);
  }, []);

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

  // gtag.js waits for the first user interaction, then loads in an idle slot.
  //
  // Two separate problems forced this. A plain async tag in _document evaluated
  // gtag inside the hydration window. Moving it to requestIdleCallback was not
  // enough on Notion routes, whose hydration runs long enough that the first
  // idle slot still lands in the busy window (measured: gtag fetched at ~1.2s,
  // ~120ms of gtag execution on /studio).
  //
  // Loading it *during* the triggering interaction would just move the jank onto
  // the user's click, so the listener only schedules an idle callback.
  //
  // Trade-off: a session that leaves without interacting reports only after the
  // fallback timer below.
  useEffect(() => {
    const gaId = process.env.NEXT_PUBLIC_GA_ID;
    if (!gaId || document.getElementById("gtag-js")) {
      return;
    }

    const EVENTS = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"];
    let loaded = false;

    const load = () => {
      if (loaded || document.getElementById("gtag-js")) return;
      loaded = true;
      const script = document.createElement("script");
      script.id = "gtag-js";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
      document.head.append(script);
    };

    const schedule = () => {
      cleanup();
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(load, { timeout: 2000 });
      } else {
        window.setTimeout(load, 200);
      }
    };

    // Bounds the delay so a session that never interacts still reports.
    const fallback = window.setTimeout(schedule, 10_000);

    function cleanup() {
      window.clearTimeout(fallback);
      for (const name of EVENTS) {
        window.removeEventListener(name, schedule);
      }
    }

    for (const name of EVENTS) {
      window.addEventListener(name, schedule, { passive: true });
    }

    return cleanup;
  }, []);

  return (
    <DarkModeProvider>
      <ChatPromotionSessionProvider>
        <TooltipProvider>
          <NavigationProgress />
          <Component {...pageProps} />
        </TooltipProvider>
      </ChatPromotionSessionProvider>
    </DarkModeProvider>
  );
}
