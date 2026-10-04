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
      if (props.error) {
        throw new Error(props.error.message || "Unable to resolve Notion page");
      }
      logPagePropsSize("/studio", props);
      return { props, revalidate: 3600 };
    } catch (err) {
      console.error("page error", domain, err);
      // Transient failures are not evidence of a missing page. Throwing keeps
      // the last healthy ISR artifact and makes builds/admin refreshes fail
      // explicitly rather than publishing an accidental not-found artifact.
      throw err;
    }
  };
}
