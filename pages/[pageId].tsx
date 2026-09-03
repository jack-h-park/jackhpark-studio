import { type GetStaticProps } from "next";

import { NotionPage } from "@/components/NotionPage";
import { domain, isDev, pageUrlOverrides } from "@/lib/config";
import { getSiteMap } from "@/lib/get-site-map";
import { resolveNotionPage } from "@/lib/resolve-notion-page";
import { type PageProps, type Params } from "@/lib/types";

export const getStaticProps: GetStaticProps<PageProps, Params> = async (
  context,
) => {
  const rawPageId = context.params?.pageId as string;

  try {
    const [props, siteMap] = await Promise.all([
      resolveNotionPage(domain, rawPageId),
      getSiteMap(),
    ]);

    return {
      props: {
        ...props,
        canonicalPageMap: siteMap?.canonicalPageMap || null,
      },
      revalidate: 60,
    };
  } catch (err) {
    console.error("page error", domain, rawPageId, err);

    // A thrown error means the fetch failed (Notion 429s during a build that
    // prerenders every page, a network blip), NOT that the page is gone.
    // Returning notFound here writes a 404 into the prerender/ISR cache, where
    // it long outlives the outage that caused it: a 429 storm during one build
    // took 48 live pages off the site until the next deploy happened to succeed.
    // Rethrowing keeps the failure uncached — a background revalidation keeps
    // serving the last good page, and an on-demand render fails only that one
    // request and is retried on the next.
    throw err;
  }
};

export async function getStaticPaths() {
  if (isDev) {
    return {
      paths: [],
      fallback: 'blocking',
    };
  }

  let siteMap;
  try {
    siteMap = await getSiteMap();
  } catch (err) {
    console.error("site map error", domain, err);
    return {
      paths: [],
      fallback: 'blocking',
    };
  }

  const allPageIds = [
    ...new Set([
      ...Object.keys(siteMap.canonicalPageMap),
      ...Object.keys(pageUrlOverrides),
    ]),
  ];

  const staticPaths = {
    paths: allPageIds.map((pageId) => ({ params: { pageId } })),
    fallback: 'blocking',
  };

  console.log(staticPaths.paths);
  return staticPaths;
}

export default function NotionDomainDynamicPage(props: PageProps) {
  return <NotionPage {...props} />;
}
