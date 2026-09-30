import type { GetStaticProps } from "next";

import type { getSiteMap } from "../get-site-map";
import type { resolveNotionPage } from "../resolve-notion-page";
import type { PageProps, Params } from "../types";
import { isSupportedNotionRoute } from "../notion-route";

export function createDynamicNotionStaticProps(
  domain: string,
  resolvePage: typeof resolveNotionPage,
  loadSiteMap: typeof getSiteMap,
): GetStaticProps<PageProps, Params> {
  return async (context) => {
    const rawPageId = context.params?.pageId;
    if (!isSupportedNotionRoute(rawPageId)) return { notFound: true };

    const props = await resolvePage(domain, rawPageId, {
      forceRefresh: context.revalidateReason === "on-demand",
    });
    if (props.error?.code === "UNKNOWN_ROUTE") {
      return { notFound: true, revalidate: 3600 };
    }
    // ACL/record-shape errors are not proof that a URL is unknown. Like a
    // thrown upstream failure, they must preserve the last healthy ISR page.
    if (props.error) {
      throw new Error(props.error.message || "Unable to resolve Notion page");
    }
    const siteMap = await loadSiteMap();
    return {
      props: { ...props, canonicalPageMap: siteMap?.canonicalPageMap || null },
      revalidate: 3600,
    };
  };
}
