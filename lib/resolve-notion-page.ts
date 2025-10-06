// lib/resolve-notion-page.ts
import { type ExtendedRecordMap } from 'notion-types'
import { parsePageId, uuidToId } from 'notion-utils'

import type { PageProps } from './types'
import * as acl from './acl'
import { environment, pageUrlAdditions, pageUrlOverrides, site } from './config'
import { db } from './db'
import { getSiteMap } from './get-site-map'
import { getPage } from './notion'

/**
 * Resolve a Notion page based on domain + rawPageId
 * Handles canonical UUID parsing and cached site map lookup
 */
export async function resolveNotionPage(
  domain: string,
  rawPageId?: string
): Promise<PageProps> {
  let pageId: string | undefined
  let recordMap: ExtendedRecordMap

  if (rawPageId && rawPageId !== 'index') {
    /**
     * ✅ Step 1: Normalize pageId
     * Some URLs may contain Notion IDs without hyphens (e.g. 28399029c0b480e3bb1bfec84fe83407)
     * parsePageId() requires canonical UUID form (with hyphens)
     * So we convert it safely here.
     */
    const normalizedId = rawPageId.includes('-')
      ? rawPageId
      : uuidToId(rawPageId)

    pageId = parsePageId(normalizedId)!

    // Step 2: Fallback — check if the site config provides overrides
    if (!pageId) {
      const override =
        pageUrlOverrides[rawPageId] || pageUrlAdditions[rawPageId]

      if (override) {
        pageId = parsePageId(override)!
      }
    }

    // Step 3: Redis/DB cache lookup
    const useUriToPageIdCache = true
    const cacheKey = `uri-to-page-id:${domain}:${environment}:${rawPageId}`
    const cacheTTL = undefined // disable TTL for now

    if (!pageId && useUriToPageIdCache) {
      try {
        pageId = await db.get(cacheKey)
      } catch (err: any) {
        console.warn(`redis error get "${cacheKey}"`, err.message)
      }
    }

    // Step 4: Direct page load
    if (pageId) {
      recordMap = await getPage(pageId)
    } else {
      // Step 5: canonicalPageMap fallback (siteMap lookup)
      const siteMap = await getSiteMap()
      pageId = siteMap?.canonicalPageMap[rawPageId]

      if (pageId) {
        recordMap = await getPage(pageId)

        if (useUriToPageIdCache) {
          try {
            await db.set(cacheKey, pageId, cacheTTL)
          } catch (err: any) {
            console.warn(`redis error set "${cacheKey}"`, err.message)
          }
        }
      } else {
        // ❌ No match found — return 404 gracefully
        return {
          error: {
            message: `Not found "${rawPageId}"`,
            statusCode: 404
          }
        }
      }
    }
  } else {
    /**
     * Default: if no rawPageId, use the root Notion page
     */
    pageId = site.rootNotionPageId
    recordMap = await getPage(pageId)
  }

  /**
   * ✅ Return unified page props
   */
  const props: PageProps = { site, recordMap, pageId }
  return { ...props, ...(await acl.pageAcl(props)) }
}


// import { type ExtendedRecordMap } from 'notion-types'
// import { parsePageId } from 'notion-utils'

// import type { PageProps } from './types'
// import * as acl from './acl'
// import { environment, pageUrlAdditions, pageUrlOverrides, site } from './config'
// import { db } from './db'
// import { getSiteMap } from './get-site-map'
// import { getPage } from './notion'

// export async function resolveNotionPage(
//   domain: string,
//   rawPageId?: string
// ): Promise<PageProps> {
//   let pageId: string | undefined
//   let recordMap: ExtendedRecordMap

//   if (rawPageId && rawPageId !== 'index') {
//     pageId = parsePageId(rawPageId)!

//     if (!pageId) {
//       // check if the site configuration provides an override or a fallback for
//       // the page's URI
//       const override =
//         pageUrlOverrides[rawPageId] || pageUrlAdditions[rawPageId]

//       if (override) {
//         pageId = parsePageId(override)!
//       }
//     }

//     const useUriToPageIdCache = true
//     const cacheKey = `uri-to-page-id:${domain}:${environment}:${rawPageId}`
//     // TODO: should we use a TTL for these mappings or make them permanent?
//     // const cacheTTL = 8.64e7 // one day in milliseconds
//     const cacheTTL = undefined // disable cache TTL

//     if (!pageId && useUriToPageIdCache) {
//       try {
//         // check if the database has a cached mapping of this URI to page ID
//         pageId = await db.get(cacheKey)

//         // console.log(`redis get "${cacheKey}"`, pageId)
//       } catch (err: any) {
//         // ignore redis errors
//         console.warn(`redis error get "${cacheKey}"`, err.message)
//       }
//     }

//     if (pageId) {
//       recordMap = await getPage(pageId)
//     } else {
//       // handle mapping of user-friendly canonical page paths to Notion page IDs
//       // e.g., /developer-x-entrepreneur versus /71201624b204481f862630ea25ce62fe
//       const siteMap = await getSiteMap()
//       pageId = siteMap?.canonicalPageMap[rawPageId]

//       if (pageId) {
//         // TODO: we're not re-using the page recordMap from siteMaps because it is
//         // cached aggressively
//         // recordMap = siteMap.pageMap[pageId]

//         recordMap = await getPage(pageId)

//         if (useUriToPageIdCache) {
//           try {
//             // update the database mapping of URI to pageId
//             await db.set(cacheKey, pageId, cacheTTL)

//             // console.log(`redis set "${cacheKey}"`, pageId, { cacheTTL })
//           } catch (err: any) {
//             // ignore redis errors
//             console.warn(`redis error set "${cacheKey}"`, err.message)
//           }
//         }
//       } else {
//         // note: we're purposefully not caching URI to pageId mappings for 404s
//         return {
//           error: {
//             message: `Not found "${rawPageId}"`,
//             statusCode: 404
//           }
//         }
//       }
//     }
//   } else {
//     pageId = site.rootNotionPageId

//     console.log(site)
//     recordMap = await getPage(pageId)
//   }

//   const props: PageProps = { site, recordMap, pageId }
//   return { ...props, ...(await acl.pageAcl(props)) }
// }
