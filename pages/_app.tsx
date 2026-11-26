// global styles shared across the entire site
import "../styles/global.css";
import "@/styles/ai-design-system.css";

// this might be better for dark mode
// import 'prismjs/themes/prism-okaidia.css'
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import React, { useEffect } from "react";

import { useSiteAnalytics } from "@/components/analytics/SiteAnalytics";
import { ChatPromotionSessionProvider } from "@/components/chat/context/ChatPromotionSessionContext";
import { DarkModeProvider } from "@/components/DarkModeProvider";
import { NavigationProgress } from "@/components/NavigationProgress";
import { TooltipProvider } from "@/components/ui/tooltip";
import { notionPolishProfile } from "@/lib/config";
import { geistMono, geistSans } from "@/lib/fonts";

export {
  event,
  GA_TRACKING_ID,
  pageview,
} from "@/components/analytics/SiteAnalytics";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  // Apply the notion-polish-* body class once for the entire session.
  // This must live here (not inside NotionPage) so it is never removed
  // during client-side page transitions — removing it mid-navigation is
  // what caused the full-screen white flash on back navigation.
  useEffect(() => {
    document.body.classList.add(`notion-polish-${notionPolishProfile}`);
  }, []);

  useSiteAnalytics(router.events);

  return (
    <DarkModeProvider>
      {/* Geist on every Pages Router surface: Notion pages, the chat, the
          landing page and Admin. Declared on :root rather than as a wrapper
          class so portalled UI (drawers, the floating chat) resolves it too. */}
      <style jsx global>{`
        :root {
          --font-geist-sans: ${geistSans.style.fontFamily};
          --font-geist-mono: ${geistMono.style.fontFamily};
        }
      `}</style>
      <ChatPromotionSessionProvider>
        <TooltipProvider>
          <NavigationProgress />
          <Component {...pageProps} />
        </TooltipProvider>
      </ChatPromotionSessionProvider>
    </DarkModeProvider>
  );
}
