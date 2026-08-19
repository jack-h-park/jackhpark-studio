import { getNotionPageIsPublic } from "./rag/notion-metadata";
import { normalizeNotionRecordMap } from "./rag/notion-record-value";
import { type PageProps } from "./types";

export async function pageAcl({
  site,
  recordMap,
  pageId,
}: PageProps): Promise<PageProps | undefined> {
  if (!site) {
    return {
      error: {
        statusCode: 404,
        message: "Unable to resolve notion site",
      },
    };
  }

  if (!recordMap) {
    return {
      error: {
        statusCode: 404,
        message: `Unable to resolve page for domain "${site.domain}". Notion page "${pageId}" not found.`,
      },
    };
  }

  const keys = Object.keys(recordMap.block);
  const rootKey = keys[0];

  if (!rootKey) {
    return {
      error: {
        statusCode: 404,
        message: `Unable to resolve page for domain "${site.domain}". Notion page "${pageId}" invalid data.`,
      },
    };
  }

  // A page whose `_is_public` checkbox is unchecked is not served, at any URL.
  // Keeping it out of the sitemap is not enough on its own: resolveNotionPage
  // loads a page directly whenever the URL carries its id (Step 1 + Step 4),
  // never consulting canonicalPageMap, so a de-listed page stays reachable at
  // /<uuid>. The gate belongs here, on the path every resolution takes.
  if (pageId) {
    const isPublic = getNotionPageIsPublic(
      normalizeNotionRecordMap(recordMap),
      pageId,
    );
    if (isPublic === false) {
      return {
        error: {
          statusCode: 404,
          message: `Notion page "${pageId}" is not public.`,
        },
      };
    }
  }

  const rootValue = recordMap.block[rootKey]?.value;
  const rootSpaceId = rootValue?.space_id;

  if (
    rootSpaceId &&
    site.rootNotionSpaceId &&
    rootSpaceId !== site.rootNotionSpaceId
  ) {
    if (process.env.NODE_ENV) {
      return {
        error: {
          statusCode: 404,
          message: `Notion page "${pageId}" doesn't belong to the Notion workspace owned by "${site.domain}".`,
        },
      };
    }
  }
}
