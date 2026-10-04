import { NotionPage } from "@/components/NotionPage";
import { domain } from "@/lib/config";
import { getSiteMap } from "@/lib/get-site-map";
import { resolveNotionPage } from "@/lib/resolve-notion-page";
import { createDynamicNotionStaticProps } from "@/lib/server/dynamic-notion-static-props";
import { type PageProps } from "@/lib/types";

export const getStaticProps = createDynamicNotionStaticProps(
  domain,
  resolveNotionPage,
  getSiteMap,
);

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
