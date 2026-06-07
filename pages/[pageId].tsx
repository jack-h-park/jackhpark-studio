import { type GetStaticProps } from "next";

import { NotionPage } from "@/components/NotionPage";
import { domain, isDev } from "@/lib/config";
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

    // we don't want to publish the error version of this page, so
    // fall back to 404 to avoid failing the build on transient fetch errors
    return {
      notFound: true,
      revalidate: 60,
    };
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

  const staticPaths = {
    paths: Object.keys(siteMap.canonicalPageMap).map((pageId) => ({
      params: {
        pageId,
      },
    })),
    // paths: [],
    fallback: 'blocking',
  };

  console.log(staticPaths.paths);
  return staticPaths;
}

export default function NotionDomainDynamicPage(props: PageProps) {
  return <NotionPage {...props} />;
}
