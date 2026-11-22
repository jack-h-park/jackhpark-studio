import "@/styles/site-tokens.css";
import "@/styles/pm-intelligence.css";
import "@/styles/jp-theme.css";
import "@/components/pm-intelligence-world/reset.css";

import type { ReactNode } from "react";

import { GoogleAnalyticsBootstrap } from "@/components/analytics/GoogleAnalyticsBootstrap";
import { ExperienceAnalytics } from "@/components/pm-intelligence-world/ExperienceAnalytics";
import { geistMono, geistSans } from "@/lib/fonts";
import { THEME_NOFLASH_SCRIPT } from "@/lib/theme";

export default function ExperienceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <GoogleAnalyticsBootstrap />
        <script dangerouslySetInnerHTML={{ __html: THEME_NOFLASH_SCRIPT }} />
        {children}
        <ExperienceAnalytics />
      </body>
    </html>
  );
}
