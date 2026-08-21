# Notion Image Loading Strategy

## Overview

Notion page images are not embedded in the JSON payload returned by the Notion API. They are hosted externally and must be fetched at runtime by the browser. This document describes how the app loads those images, what happens when the direct request fails, and how the fallback chain behaves at Vercel's optimization limits.

---

## Loading Chain

```
Browser
  │
  ▼
① <img src="notion.so/image/...">   ← direct request, no server involvement
  │
  ├── success ──────────────────────► render (zero cost, no proxy)
  │
  └── failure (onError)
        │
        ▼
      ② same <img>, src → /_next/image  ← Next.js optimizer as a proxy
          │
          ├── server fetches image from notion.so on client's behalf
          ├── resizes + converts to WebP/AVIF
          └── serves result to browser
                │
                ├── success ─────────► render (Vercel: counts as 1 optimization)
                │
                └── failure ─────────► broken image icon (no further retry)
```

### Stage 1 — Direct load

The `NotionImage` component (`components/NotionImage.tsx`) renders a plain `<img>` tag pointing to the Notion-hosted URL. This path has no server involvement and incurs no Vercel image optimization charge.

**Failure triggers:** firewall blocking `notion.so`, expired signed S3 URL, network error.

### Stage 2 — Next.js image proxy (fallback)

On `onError`, the component swaps **only the `src`** to `/_next/image?url=<encoded>&w=<width>&q=75` (built by `getNextImageProxyUrl` in `lib/next-image-proxy.ts`). Next.js fetches the image server-side, optimizes it, and caches the result.

The element itself — tag, classes, inline styles, `ref` — is unchanged, so the fallback can never alter page layout, and `medium-zoom` keeps working.

**Why not render `next/image` here.** react-notion-x calls `components.Image` with `width: null, height: null`, so a `next/image` fallback would always have to run in `fill` mode. `fill` makes the element `position: absolute`, which collapses it to zero height inside Notion's unsized wrappers and stretches page icons to the full content column. Requesting the optimizer endpoint directly gets the same proxying without the layout contract.

The requested `w` is derived from the element's rendered width × DPR, snapped up to an allowed optimizer bucket and capped at 2048. `NEXT_IMAGE_WIDTHS` in that module must stay in sync with `images.deviceSizes`/`images.imageSizes` in `next.config.js` — the optimizer returns 400 for any other width.

The server must be able to reach `notion.so` for this to work. If the server is behind the same firewall as the browser, stage 2 also fails.

### Coverage

Everything that renders a Notion-hosted image participates in the chain:

| Surface                                  | Path                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Page content, icons, gallery card covers | `NotionImage` via `components.Image` + `forceCustomImages`                                               |
| Page cover (`NotionCoverBlurFill`)       | Own `onError`; the blurred CSS background shares the resolved URL, since a `url()` cannot report failure |
| Gallery preview modal                    | `NotionImage`                                                                                            |
| AI page header (`AiPageChrome`)          | `NotionImage` registered on the `NotionContextProvider`                                                  |

`NotionPageRenderer` also installs a document-level capture listener that replaces broken **icons** with `defaultPageIcon` (or hides them). That handler retries through the proxy first and only treats an icon as missing once the proxied attempt has failed — otherwise a blocked host would silently hide every inline icon before the fallback ran.

---

## Why the Two-Stage Approach

|                                     | Stage 1 (`<img>`)   | Stage 2 (`NextImage`)       |
| ----------------------------------- | ------------------- | --------------------------- |
| Who fetches                         | Browser             | Next.js server              |
| Vercel charge                       | None                | 1 unit per unique URL+size  |
| Requires server access to notion.so | No                  | Yes                         |
| Use case                            | Normal environments | Firewall-restricted clients |

Defaulting to stage 1 avoids Vercel image optimization charges for users who can reach `notion.so` directly, which is the common case.

---

## Vercel Image Optimization Limits

Stage 2 uses Vercel's image optimization service. Charges apply per **unique (source URL + output size) pair generated**. Subsequent requests for the same pair are served from cache and do not count.

**Notion-specific caveat:** Notion image URLs include expiring AWS Signature parameters (`X-Amz-Expires`, `X-Amz-Signature`). When a URL expires (typically every 1 hour), a new signed URL is generated. Vercel treats this as a new source URL and generates a new optimization — resetting the cache. High-traffic pages with many images can accumulate charges quickly.

### Behavior at the limit

| Plan  | Monthly allowance   | At limit                                                         |
| ----- | ------------------- | ---------------------------------------------------------------- |
| Hobby | 1,000 optimizations | Hard cap — stage 2 stops, original unoptimized image is served   |
| Pro   | 5,000 optimizations | Overages billed at $5 / 1,000 unless Spend Management cap is set |

**To set a hard cap on Pro:** Vercel Dashboard → Settings → Billing → Spend Management → Image Optimization.

When the limit is hit, Vercel serves the original (unoptimized) image directly rather than erroring. The image still loads; only optimization is skipped.

---

## Configuration

### `next.config.js` — allowed proxy origins

`remotePatterns` controls which hostnames `/_next/image` is permitted to proxy. Requests for unlisted hostnames are rejected with 400.

```js
images: {
  remotePatterns: [
    { protocol: "https", hostname: "www.notion.so" },
    { protocol: "https", hostname: "notion.so" },
    { protocol: "https", hostname: "img.notionusercontent.com" },
    { protocol: "https", hostname: "images.unsplash.com" },
    { protocol: "https", hostname: "abs.twimg.com" },
    { protocol: "https", hostname: "pbs.twimg.com" },
    { protocol: "https", hostname: "*.amazonaws.com" },
  ],
}
```

Add a new entry here whenever a new Notion image host is encountered in production.

### `NotionImage` component — `components/NotionImage.tsx`

The component is registered as `Image: NotionImage` in the `NotionRenderer` components map. It manages the stage 1 → stage 2 transition via `React.useState<string | null>(null)` (`proxySrc`).

Key behaviors:

- Exactly one retry. Once `src` is already a `/_next/image` URL the error is final — retrying would loop forever against a host the server can't reach either.
- A changed `src` prop resets `proxySrc`, so a re-signed Notion URL gets a fresh direct attempt.
- `blurDataURL` / `placeholder="blur"` is applied as a CSS background on the `<img>` in both stages, and cleared on `load`. The background sits _behind_ the image, so leaving it in place makes a transparent PNG show its own blurred copy through the transparent pixels forever.
- The forwarded `ref` stays attached across both stages.

---

## LQIP Blur Placeholders

`isPreviewImageSupportEnabled` (site.config.ts) drives **both** ends of the feature and they must stay in sync:

1. `getPreviewImageMap` (`lib/preview-images.ts`) downloads each image at fetch time, generates a tiny base64 placeholder, and attaches it as `recordMap.preview_images`.
2. `NotionPageRenderer` passes `previewImages` to `NotionRenderer`, which is what makes react-notion-x read that map and hand `blurDataURL` to `components.Image`.

Either half alone is a no-op — the flag was on with step 2 missing for a long time, so the server generated placeholders nobody rendered.

The scan runs through `normalizeNotionRecordMap` because notion-utils reads `block[id].value` while the render path ships doubly-nested `value.value` entries. Without that unwrap `getPageImageUrls` returns zero URLs and the map is silently empty.

Generation runs in `finalizeRecordMap` (`lib/notion.ts`), **after** `hydrateGroupedCollectionData` — hydration is what pulls gallery card blocks and their covers into the record map, so generating earlier silently skips every gallery cover (16 placeholders instead of 133 on `/studio`).

Gallery cards render through the `collectionCardCover` seam rather than react-notion-x's `LazyImage`, so `lib/notion-collection-card-cover.tsx` does its own `preview_images` lookup and passes `placeholder`/`blurDataURL` to the cover image component. Populating the map is not enough on its own.

**Cost** (measured on `/studio`, 141 candidate URLs): ~0.2 kB of blur data per image and ~530 ms to generate one; 133 placeholders add ~52 kB to the page props. `getPreviewImage` is `pMemoize`d with no TTL, so a process pays generation once and later cache-hit paths only rebuild the map. Pages are ISR (`revalidate: 60`), so regeneration stays off the visitor's critical path. Redis (`isRedisEnabled`) only saves recomputation across instances — it is not required.

## Externally Hosted Images Rot

Notion attachments are re-signed on demand and effectively never break. Images
Notion snapshots from _other_ people's servers do.

Bookmarking a page stores whatever preview the site advertised at that moment
(`bookmark_cover` / `bookmark_icon`) and keeps that URL forever. When the file
is later renamed, deleted, or served under a thumbnail spec the host stops
honouring, the bookmark renders with a broken cover and nothing in the app can
tell — the URL is still a well-formed link to somebody else's server.

`pnpm report:external-images` walks the workspace and reports which of these no
longer resolve. It checks the URL the browser actually requests (Notion's
`/image/` proxy) and, when that fails, the upstream URL too, because the two
failures need different fixes:

| verdict             | meaning                                                 | fix                                                     |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| `stale-thumbnail`   | original file is fine, the stored thumbnail URL is dead | re-add the bookmark so Notion snapshots a current URL   |
| `gone`              | upstream serves nothing at that path                    | re-adding will not help — new source, or drop the cover |
| `notion-proxy-only` | upstream is fine, Notion refuses to proxy it            | re-add the bookmark, or self-host the image             |

It exits non-zero when anything is broken, so it can gate a scheduled check.
`format.display_source` is deliberately not scanned: on video and embed blocks
that is the embed URL, not an image, and Notion's proxy answers those with 422.

## Self-Hosted Environments

On a self-hosted Next.js server (`next start`), image optimization is performed by the `sharp` library bundled with the server. There is no per-optimization charge. The only cost is CPU and memory on the host for the resize/convert operation, which is cached to disk after the first request.

This makes stage 2 cost-free on self-hosted deployments regardless of traffic volume.
