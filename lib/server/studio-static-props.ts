import type { GetStaticProps } from "next";

import type { PageProps } from "../types";
import { domain } from "../config";
import { logPagePropsSize } from "../diagnostics/measurePageProps";
import { resolveNotionPage } from "../resolve-notion-page";

export function createStudioStaticProps(
  resolvePage: typeof resolveNotionPage = resolveNotionPage,
): GetStaticProps<PageProps> {
  return async (context) => {
    const forceRefresh = context.revalidateReason === "on-demand";
    try {
      const props = await resolvePage(domain, undefined, { forceRefresh });
      logPagePropsSize("/studio", props);
      return { props, revalidate: 3600 };
    } catch (err) {
      console.error("page error", domain, err);
      // Throwing preserves Next's last healthy ISR artifact and makes the
      // admin revalidation API report failure instead of accepting a 404.
      if (forceRefresh) throw err;

      // Preserve the existing short retry policy for ordinary ISR/builds.
      return { notFound: true, revalidate: 10 };
    }
  };
}
