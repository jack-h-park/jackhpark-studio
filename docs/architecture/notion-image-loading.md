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
      ② <NextImage src="...">        ← Next.js /_next/image proxy
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

The `NotionImage` component (`components/NotionPage.tsx`) renders a plain `<img>` tag pointing to the Notion-hosted URL. This path has no server involvement and incurs no Vercel image optimization charge.

**Failure triggers:** firewall blocking `notion.so`, expired signed S3 URL, network error.

### Stage 2 — Next.js image proxy (fallback)

On `onError`, the component re-renders using `next/image` (`NextImage`). Next.js intercepts the request at `/_next/image?url=<encoded>&w=<width>&q=75`, fetches the image server-side, optimizes it, and caches the result.

The server must be able to reach `notion.so` for this to work. If the server is behind the same firewall as the browser, stage 2 also fails.

---

## Why the Two-Stage Approach

| | Stage 1 (`<img>`) | Stage 2 (`NextImage`) |
|---|---|---|
| Who fetches | Browser | Next.js server |
| Vercel charge | None | 1 unit per unique URL+size |
| Requires server access to notion.so | No | Yes |
| Use case | Normal environments | Firewall-restricted clients |

Defaulting to stage 1 avoids Vercel image optimization charges for users who can reach `notion.so` directly, which is the common case.

---

## Vercel Image Optimization Limits

Stage 2 uses Vercel's image optimization service. Charges apply per **unique (source URL + output size) pair generated**. Subsequent requests for the same pair are served from cache and do not count.

**Notion-specific caveat:** Notion image URLs include expiring AWS Signature parameters (`X-Amz-Expires`, `X-Amz-Signature`). When a URL expires (typically every 1 hour), a new signed URL is generated. Vercel treats this as a new source URL and generates a new optimization — resetting the cache. High-traffic pages with many images can accumulate charges quickly.

### Behavior at the limit

| Plan | Monthly allowance | At limit |
|---|---|---|
| Hobby | 1,000 optimizations | Hard cap — stage 2 stops, original unoptimized image is served |
| Pro | 5,000 optimizations | Overages billed at $5 / 1,000 unless Spend Management cap is set |

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

### `NotionImage` component — `components/NotionPage.tsx`

The component is registered as `Image: NotionImage` in the `NotionRenderer` components map. It manages the stage 1 → stage 2 transition via `React.useState(false)` (`useFallback`).

Key behaviors:
- `fill` prop propagates to `NextImage` for images without explicit dimensions (cover photos, page icons).
- `blurDataURL` / `placeholder="blur"` is applied as a CSS background on the `<img>` in stage 1 and passed to `NextImage` in stage 2.
- The forwarded `ref` is attached to the `<img>` in stage 1 only; it is not forwarded in stage 2 (Next.js Image manages its own DOM node).

---

## Self-Hosted Environments

On a self-hosted Next.js server (`next start`), image optimization is performed by the `sharp` library bundled with the server. There is no per-optimization charge. The only cost is CPU and memory on the host for the resize/convert operation, which is cached to disk after the first request.

This makes stage 2 cost-free on self-hosted deployments regardless of traffic volume.
