# Notion Image Loading Strategy

## Overview

Notion page images are not embedded in the JSON payload returned by the Notion API. They are hosted externally and must be fetched at runtime by the browser. This document describes how the app loads those images, what happens when the direct request fails, and how the fallback chain behaves at Vercel's optimization limits.

---

## Loading Chain

```
Browser
  │
  ▼
① <img src="/_next/image?..." srcset="…384w, …640w, …828w" sizes="…">
  │     ← same-origin; the server fetches from notion.so, resizes, AVIF/WebP
  │
  ├── success ──────────────────────► render (Vercel: 1 optimization per
  │                                     unique url+width, then cached 90 days)
  │
  └── failure (onError)
        │
        ▼
      ② same <img>, src → notion.so/image/...  ← the original, unsized
          │
          ├── success ─────────────► render
          │
          └── failure ─────────────► broken image icon (no further retry)
```

### Stage 1 — Optimizer, at the width the layout uses

The `NotionImage` component (`components/NotionImage.tsx`) points the `<img>` at
`/_next/image`, with the width ladder its **role** implies —
`lib/notion-image-delivery.ts` turns a role into `src`/`srcSet`/`sizes`.

**Why roles and not measured widths.** The component would have to be laid out
before it could measure itself, which is one request too late. What the layout
does guarantee ahead of time is the role: an icon is small wherever it appears,
a card cover is bounded by the gallery grid, body copy is bounded by the
reading column.

| role         | ladder            | `sizes`                           | surface                  |
| ------------ | ----------------- | --------------------------------- | ------------------------ |
| `icon`       | 256 (single)      | —                                 | page icons, inline icons |
| `card-cover` | 384 / 640 / 828   | `(max-width: 640px) 100vw, 360px` | gallery card covers      |
| `content`    | 828 / 1200 / 1920 | `(max-width: 768px) 100vw, 720px` | body images              |

The full-bleed page cover band is the one role kept elsewhere
(`lib/notion-cover-image.ts`): it also needs a blurred backdrop variant and it
feeds a preload hint in `PageHead`.

Surfaces this repo renders itself pass `imageRole` explicitly. react-notion-x
routes every image through the one `components.Image` seam, so there the role is
inferred from the class name — `notion-page-icon` as a whole class token, since
`notion-page-icon-inline` names the _wrapper_ around an inline icon.

`content` deliberately ladders past the 720px reading column: these are the
images `medium-zoom` opens full-screen, so the retina rung has to stay close to
the source. It costs little — the optimizer never upscales, and the AVIF
conversion rather than the downscale is where most of the saving comes from
(a 2354px screenshot: 1,032 kB original → 52 kB at `w=1920`, → 12 kB at `w=640`).

### Stage 2 — The original Notion URL (fallback)

On `onError`, the component drops `srcSet`/`sizes` and swaps `src` to the
Notion-hosted URL — the unsized original, which is what every surface shipped
before. This covers the optimizer being unable to fetch the source at all
(upstream 403, a host missing from `remotePatterns`, a self-hosted server that
cannot reach notion.so).

The element itself — tag, classes, inline styles, `ref` — is unchanged, so the
fallback can never alter page layout, and `medium-zoom` keeps working.

### Why the stages run this way round

They used to run the other way: direct first, optimizer only on failure, to keep
Vercel optimization charges at zero. That traded charges for bytes with no
ceiling, because Notion serves the untouched original at every surface.
Measured on `/studio` before the change: 32 of 33 images were unoptimized
originals, including a 3705px photo in a 21px avatar (1,368 kB), a 900px icon in
a 22px box (1,093 kB) and 2354px screenshots in 269px cards (1,032 kB) — six
images totalling ~5.2 MB.

Putting the optimizer first also removes the reason stage 2 originally existed:
`/_next/image` is same-origin, so a firewall that blocks `notion.so` no longer
blocks the image.

**Why not render `next/image` here.** react-notion-x calls `components.Image` with `width: null, height: null`, so `next/image` would always have to run in `fill` mode. `fill` makes the element `position: absolute`, which collapses it to zero height inside Notion's unsized wrappers and stretches page icons to the full content column. Requesting the optimizer endpoint directly gets the same optimization without the layout contract — and lets each surface state its own `sizes`, which is what `fill` would have taken away.

`getNextImageProxyUrl` (`lib/next-image-proxy.ts`) still derives a `w` from an
element's rendered width × DPR for callers that only learn their size at error
time — the icon handler below. `NEXT_IMAGE_WIDTHS` in that module must stay in
sync with `images.deviceSizes`/`images.imageSizes` in `next.config.js`; the
optimizer returns 400 for any other width.

The server must be able to reach `notion.so` for stage 1 to work.

**`next dev` cannot.** Its built-in optimizer fetches with Node's global
`fetch`, and notion.so's bot filter answers a `user-agent: node` with 403 —
the same failure `lib/notion-image-fetch.ts` documents, and the optimizer sends
no user-agent we can configure. Probed 2026-09-20: only the literal `node`
agent is rejected; no agent at all, `undici` and a browser string all get the 302. So locally **every** image takes stage 2 and renders the original. That is
the degraded path working, not a regression — never measure optimized sizes
against `next dev`. Vercel's optimizer fetches the same URLs fine.

### Coverage

Everything that renders a Notion-hosted image participates in the chain:

| Surface                                  | Path                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Page content, icons, gallery card covers | `NotionImage` via `components.Image` + `forceCustomImages`                                               |
| Page cover (`NotionCoverBlurFill`)       | Own `onError`; the blurred CSS background shares the resolved URL, since a `url()` cannot report failure |
| Gallery preview modal                    | `NotionImage`                                                                                            |
| AI page header (`AiPageChrome`)          | `NotionImage` registered on the `NotionContextProvider`                                                  |

`NotionPageRenderer` also installs a document-level capture listener that
replaces broken **icons** with `defaultPageIcon` (or hides them). A failed
request is not a missing icon, so that handler must not run while the icon still
has a stage to try.

It sits on the document in the capture phase, which means it reaches the element
before React's own `onError`. `NotionImage` therefore marks every image it
renders with `data-notion-image-retry`, and the handler returns early while that
reads `pending`. Without the check it would pin the default icon over a stage 2
that then succeeds — which is precisely what happens in `next dev`, where every
image fails stage 1. Images `NotionImage` does not render carry no marker and
still get the old proxy retry.

---

## Vercel Image Optimization Limits

Stage 1 uses Vercel's image optimization service. Charges apply per **unique
(source URL + output size) pair generated**. Subsequent requests for the same
pair are served from cache and do not count.

**How many pairs this is.** Measured 2026-09-20 across 41 of the 167 pages in
the sitemap: 191 distinct image files, and `/studio` alone accounts for 182 of
them because the collection views carry nearly the whole corpus. Call it ~220
site-wide, times up to three rungs per ladder — a few hundred optimizations,
generated once. Optimized responses come back with
`cache-control: public, max-age=7776000` (90 days), so this is not a recurring
monthly bill.

**The signed-URL caveat no longer applies.** Notion used to hand out S3 URLs
carrying `X-Amz-Expires` / `X-Amz-Signature`; each re-signing looked like a new
source URL to Vercel and reset the cache, which is why this document previously
warned that high-traffic pages could accumulate charges quickly. The current
URLs are the stable `www.notion.so/image/attachment:<id>?table=block&id=…`
redirect endpoint — the expiring token is on the _redirect target_, not on what
we hand the optimizer. `/studio` carries 0 `X-Amz-Signature` occurrences today.
If Notion ever reverts to signed source URLs, this becomes a live concern again
and the stage order is worth revisiting.

### Behavior at the limit

| Plan  | Monthly allowance   | At limit                                                         |
| ----- | ------------------- | ---------------------------------------------------------------- |
| Hobby | 1,000 optimizations | Hard cap — stage 2 stops, original unoptimized image is served   |
| Pro   | 5,000 optimizations | Overages billed at $5 / 1,000 unless Spend Management cap is set |

**To set a hard cap on Pro:** Vercel Dashboard → Settings → Billing → Spend Management → Image Optimization.

When the limit is hit, Vercel serves the original (unoptimized) image directly rather than erroring. The image still loads; only optimization is skipped — which is exactly the behaviour every surface had before the stages were reordered, so the failure mode is a return to the old baseline rather than a broken page.

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

The component is registered as `Image: NotionImage` in the `NotionRenderer` components map. It manages the stage 1 → stage 2 transition via a `degraded` flag.

Key behaviors:

- Exactly one retry. Stage 2 is the original URL, so there is nothing left to fall back to.
- A changed `src` prop clears `degraded`, so a new image gets a fresh optimized attempt.
- `imageRole` overrides the class-name inference. Pass it wherever the surface knows its own size.
- `data-notion-image-retry` (`pending` / `exhausted`) is what the icon handler above reads. It is part of the contract, not a debugging aid.
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

| verdict             | meaning                                                 | fix                                                                                                              |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `stale-thumbnail`   | original file is fine, the stored thumbnail URL is dead | re-add the bookmark so Notion snapshots a current URL                                                            |
| `gone`              | upstream serves nothing at that path                    | re-add first — the source may advertise the image from a new location; only then a new source, or drop the cover |
| `notion-proxy-only` | upstream is fine, Notion refuses to proxy it            | re-add the bookmark, or self-host the image                                                                      |

It exits non-zero when anything is broken, so it can gate a scheduled check.
`format.display_source` is deliberately not scanned: on video and embed blocks
that is the embed URL, not an image, and Notion's proxy answers those with 422.

## Self-Hosted Environments

On a self-hosted Next.js server (`next start`), image optimization is performed by the `sharp` library bundled with the server. There is no per-optimization charge. The only cost is CPU and memory on the host for the resize/convert operation, which is cached to disk after the first request.

This makes stage 2 cost-free on self-hosted deployments regardless of traffic volume.
