import { type GetStaticProps } from "next";

import { NotionPage } from "@/components/NotionPage";
import { domain } from "@/lib/config";
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
  // Deliberately prerender nothing and let every page generate on demand.
  //
  // The unofficial Notion API rate-limits a bulk traversal even at concurrency
  // 1 once it passes a few dozen pages (see lib/notion-rate-limit.ts), so a
  // build that prerenders all ~170 pages always draws 429s. That used to be
  // survivable only because the renderer swallowed them into `notFound: true`,
  // which is what silently took 48 live pages off the site. Now that a failed
  // fetch correctly fails instead of publishing a 404, prerendering the whole
  // site would just move the outage to the build.
  //
  // On-demand generation spreads those fetches over real traffic instead of
  // firing them in one burst, and `fallback: "blocking"` still serves crawlers
  // a fully rendered page. The first hit on a cold page pays the Notion fetch;
  // ISR caches it from then on.
  return {
    paths: [],
    fallback: "blocking",
  };
}

export default function NotionDomainDynamicPage(props: PageProps) {
  return <NotionPage {...props} />;
}
