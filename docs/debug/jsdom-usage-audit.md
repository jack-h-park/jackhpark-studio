# JSDOM Usage Audit (Vercel / Node 24 `ERR_REQUIRE_ESM`)

## Scope

- Analysis only (no code changes in this audit)
- Goal: identify how `jsdom` is used, why `/admin/documents` can fail in Vercel production, and which replacements are feasible

## 1) Dependency Chain Summary

### Findings

`jsdom` is present in this repo for **two reasons**:

1. **Direct production dependency** (explicitly declared)
2. **Optional peer path via `@langchain/community`**

### Evidence

- Direct dependency in `package.json`:
  - `package.json:90` declares `"jsdom": "^27.0.1"`
- Lockfile resolves direct install to `27.3.0`:
  - `pnpm-lock.yaml:89`
  - `pnpm-lock.yaml:91`
- `@langchain/community` also references `jsdom` as an optional dependency/peer-resolved dependency in the lock:
  - `pnpm-lock.yaml:1205`
  - `pnpm-lock.yaml:5513`
  - `pnpm-lock.yaml:5534`

### `pnpm why` output (local evidence)

`pnpm why jsdom` shows:

- root project depends on `jsdom`
- `@langchain/community` depends on `jsdom` as a peer

`pnpm why parse5` shows:

- `jsdom 27.3.0 -> parse5 8.0.0`
- `@langchain/community -> jsdom 27.3.0 (peer) -> parse5 8.0.0`

### Why the `ERR_REQUIRE_ESM` happens (evidence)

- `jsdom` CJS files require `parse5`:
  - `node_modules/jsdom/lib/jsdom/browser/parser/html.js:3`
  - `node_modules/jsdom/lib/jsdom/living/domparsing/serialization.js:4`
- Installed `parse5@8.0.0` is ESM (`"type": "module"`):
  - `node_modules/.pnpm/parse5@8.0.0/node_modules/parse5/package.json:3`
  - Version evidence: `node_modules/.pnpm/parse5@8.0.0/node_modules/parse5/package.json:5`
- Lockfile confirms `jsdom@27.3.0` depends on `parse5: 8.0.0`:
  - `pnpm-lock.yaml:7598`
  - `pnpm-lock.yaml:7609`
  - `pnpm-lock.yaml:8073`

## 2) Code Usage Inventory (Where / How `jsdom` Is Invoked)

### Inventory Table

| Location | Symbol / Function | How `jsdom` is used | Runtime context | Why it exists | Hot path? |
|---|---|---|---|---|---|
| `lib/rag/index.ts:5` + `lib/rag/index.ts:670` + `lib/rag/index.ts:692` | `extractMainContent()` | `import { JSDOM } from "jsdom"` + `new JSDOM(html, { url })` | Server-only ingestion logic | Build DOM for `@mozilla/readability` article extraction and fallback text/title extraction | Not normal page render hot path; used in ingestion flows |
| `lib/rag/fetch-favicon.ts:3` + `lib/rag/fetch-favicon.ts:291` + `lib/rag/fetch-favicon.ts:293` | `extractIconLinkFromHtml()` (via `fetchFaviconForUrl`) | `import { JSDOM } from "jsdom"` + `new JSDOM(html)` | Server-only URL metadata helper | Parse `<link rel="icon"...>` from fetched HTML | Request-time in manual ingestion URL flow; also can be import-time issue transitively |
| `lib/rag/url-metadata.ts:1` + `lib/rag/url-metadata.ts:22` + `lib/rag/url-metadata.ts:50` + `lib/rag/url-metadata.ts:53` | `buildUrlRagDocumentMetadata()` / `resolveUrlFaviconMetadata()` | Wrapper utility; imports `fetchFaviconForUrl` (which imports `jsdom`) | Server-only metadata construction | URL title/image/favicon metadata assembly | Can cause `jsdom` to load transitively when module is imported |
| `pages/api/_debug/jsdom-smoke.ts:31` + `pages/api/_debug/jsdom-smoke.ts:60` + `pages/api/_debug/jsdom-smoke.ts:101` | API route handler | Runtime CommonJS-style load via `createRequire(...)(\"jsdom\")` and smoke parse | Debug API route (temporary) | Reproduce production runtime failure path intentionally | Request-only debug path |
| `test/settings-section-rag-retrieval.test.tsx:4` + `test/settings-section-rag-retrieval.test.tsx:26` | test setup module scope | `import { JSDOM } from "jsdom"` + `new JSDOM(...)` | Test-only | Provide DOM globals for React component tests | No production impact |

### Supporting Type Declaration (not runtime usage)

- `types/external-modules.d.ts:11` declares the `jsdom` module shape for TS.

### Call-Site Evidence (important)

`jsdom` usage in production code is primarily reached through two feature areas:

1. **URL article extraction**
   - `scripts/ingest-url.ts:13` / `scripts/ingest-url.ts:119` calls `extractMainContent(...)`
   - `lib/admin/manual-ingestor.ts:17` / `lib/admin/manual-ingestor.ts:935` calls `extractMainContent(...)`

2. **URL favicon metadata extraction**
   - `lib/rag/url-metadata.ts:53` calls `fetchFaviconForUrl(...)`
   - `scripts/ingest-url.ts:42` / `scripts/ingest-url.ts:176` calls `buildUrlRagDocumentMetadata(...)`
   - `lib/admin/manual-ingestor.ts:61` / `lib/admin/manual-ingestor.ts:1067` calls `buildUrlRagDocumentMetadata(...)`

## 3) Execution Path Hypothesis for `/admin/documents`

## Most likely failure path (based on static import graph)

The most likely cause of `/admin/documents` failing in production is **module import-time evaluation**, not an actual favicon/article parse happening during page render.

### Evidence chain

1. `/admin/documents` imports `deriveTitleFromUrl`:
   - `pages/admin/documents.tsx:53`
   - It is used for display fallback title generation at `pages/admin/documents.tsx:146`

2. `deriveTitleFromUrl` lives in `lib/rag/url-metadata.ts`:
   - `lib/rag/url-metadata.ts:5`

3. `lib/rag/url-metadata.ts` has a **top-level import** of `fetchFaviconForUrl`:
   - `lib/rag/url-metadata.ts:1`

4. `lib/rag/fetch-favicon.ts` has a **top-level import** of `JSDOM`:
   - `lib/rag/fetch-favicon.ts:3`

5. In production runtime, loading `jsdom` hits the `parse5` CJS/ESM mismatch:
   - `jsdom` CJS `require("parse5")` at `node_modules/jsdom/lib/jsdom/browser/parser/html.js:3`
   - `parse5@8` ESM (`"type": "module"`) at `node_modules/.pnpm/parse5@8.0.0/node_modules/parse5/package.json:3`

### Why this can break `/admin/documents` even if no favicon parsing occurs

- `pages/admin/documents.tsx` only needs `deriveTitleFromUrl(...)`, which is string/URL parsing logic.
- But because `deriveTitleFromUrl` shares a module with favicon metadata helpers, importing that file pulls in `fetchFaviconForUrl`, which pulls in `jsdom`.
- If the runtime fails while loading `jsdom`, the page module can fail before `getServerSideProps` completes.

### Why it may appear prod-only

Based on your provided runtime debug context:

- Vercel production runs Node `v24.13.0`
- Your debug smoke route reproduces the `ERR_REQUIRE_ESM` path there

Likely contributing conditions (hypothesis, consistent with evidence):

- **Node/runtime differences** between local and Vercel (most likely)
- **Serverless bundling/externalization behavior** on Vercel causing `jsdom` to be loaded from CJS files at runtime
- **Import graph sensitivity**: `/admin/documents` imports `lib/rag/url-metadata.ts` even though it only needs a pure URL title helper

This hypothesis is strongly supported by the static import graph above and the confirmed runtime `jsdom` smoke failure in production.

## 4) Replacement Feasibility Matrix

### Use cases discovered in this audit

- **Use case A:** Full HTML DOM for Readability-based article extraction (`lib/rag/index.ts`)
- **Use case B:** Lightweight HTML parsing for favicon `<link rel="icon">` extraction (`lib/rag/fetch-favicon.ts`)
- **Use case C:** Avoid accidental `jsdom` loading on `/admin/documents` SSR path (import graph hygiene)

| Option | Effort | Risk | Node 24 / serverless compatibility | Feature parity (A/B/C) | Performance implications |
|---|---|---|---|---|---|
| Keep `jsdom` (pin compatible version chain) | S | Med | Potentially OK if pinned to compatible CJS chain; brittle long-term | A: High, B: High, C: Low unless import graph also fixed | No perf improvement; keeps heavy server overhead |
| Replace with `cheerio` | M | Med | Strong (Node/serverless friendly) | A: Low (not Readability DOM), B: High, C: High (if imports separated) | Faster/lighter than `jsdom` for favicon/meta parsing |
| Replace with `linkedom` | M-L | Med-High | Generally good | A: Maybe (depends on `@mozilla/readability` DOM API compatibility), B: High, C: High | Lighter than `jsdom`; still DOM cost |
| `htmlparser2`-only approach | M | Med | Strong | A: Low (not Readability replacement), B: High, C: High | Smallest overhead for favicon/meta parsing |
| Avoid runtime parsing on request paths (precompute/store derived fields; split pure utils) | S-M | Low | Strongest | A: N/A for ingestion extraction, B: Medium-High if favicon precomputed at ingestion, C: Highest | Best request-path perf and reliability |

### Notes on matrix trade-offs

- **`cheerio` / `htmlparser2`** are excellent fits for favicon/meta extraction, but **not drop-in replacements for Readability**.
- **`linkedom`** may support enough DOM APIs for `@mozilla/readability`, but compatibility must be validated with real articles.
- **The `/admin/documents` failure itself does not require replacing all `jsdom` usage**. It can likely be resolved by **removing the transitive import of `jsdom` from the page’s SSR import graph**.

## 5) Concrete Replacement Plan (No Code, Just Plan)

## Recommendation A (Primary): Remove `jsdom` From `/admin/documents` Import Graph + Keep Ingestion Parsing Isolated

This is the lowest-risk fix for the production page failure.

### Plan

1. **Split pure URL title logic from `lib/rag/url-metadata.ts`**
   - Move `deriveTitleFromUrl(...)` into a small pure module with no favicon imports (for example, a URL string utility file).
   - Update `pages/admin/documents.tsx` to import the pure helper instead of `lib/rag/url-metadata.ts`.

2. **Keep favicon resolution in a server-only ingestion path**
   - `buildUrlRagDocumentMetadata(...)` can remain in `lib/rag/url-metadata.ts` (or be split into its own module) with server-only ingestion usage.
   - Ensure page-render modules (`pages/admin/*`) do not import modules that transitively import `jsdom`.

3. **Optionally lazy-load favicon parsing dependency in ingestion**
   - If `jsdom` remains temporarily, restrict load timing to the exact favicon/article extraction function call path (not module import time).
   - This reduces blast radius even before a full replacement.

### Behavior-parity concerns to preserve

- `deriveTitleFromUrl(...)` behavior for malformed URLs and tail-path formatting:
  - See existing behavior in `lib/rag/url-metadata.ts:5`
- `/admin/documents` display fallback title logic:
  - `pages/admin/documents.tsx:139`
  - `pages/admin/documents.tsx:146`

### Tests to add (no code in this audit)

- Unit tests for `deriveTitleFromUrl(...)`:
  - valid URL with path segments
  - root URL
  - invalid URL
- SSR smoke test for `/admin/documents` page import/render under current Node (and ideally CI Node 24)
  - Assert page responds without `ERR_REQUIRE_ESM`
- Import-graph regression test (or lint rule/check script)
  - `pages/admin/*` must not import modules that transitively depend on heavy ingestion parsers

## Recommendation B (Secondary): Replace Favicon HTML Parsing (`jsdom`) With Lighter Parser (`cheerio` or `htmlparser2`)

This addresses server overhead and removes one `jsdom` use case entirely.

### Plan

1. **Target module**
   - Replace parsing in `extractIconLinkFromHtml(...)`:
   - `lib/rag/fetch-favicon.ts:291`

2. **Replicate current behavior exactly**
   - Current behavior:
     - scans `link[rel][href]`
     - tokenizes `rel`
     - requires token `icon`
     - resolves relative `href` against base URL
   - Preserve fallback:
     - return `null` on parse failure
     - caller falls back to `${origin}/favicon.ico`
     - `lib/rag/fetch-favicon.ts:217`

3. **Keep SSRF safety and redirect logic unchanged**
   - Do not alter `fetchHtmlWithRedirects(...)` or hostname safety checks
   - Relevant code:
     - `lib/rag/fetch-favicon.ts:170`
     - `lib/rag/fetch-favicon.ts:223`
     - `lib/rag/fetch-favicon.ts:326`

### Tests to add (no code in this audit)

- Unit tests for favicon extraction cases:
  - `<link rel="icon" href="/favicon.ico">`
  - `<link rel="shortcut icon" href="...">`
  - multiple icons (first match behavior)
  - malformed HTML
  - invalid href URL
- Existing wrapper tests to keep green:
  - `test/fetch-favicon.test.ts:5`

## Longer-Term Option (Higher Impact): Re-evaluate `extractMainContent()` (`Readability + jsdom`)

If the objective expands beyond fixing `/admin/documents` and favicon parsing:

- `extractMainContent(...)` in `lib/rag/index.ts:670` is the highest `jsdom` footprint path.
- Replacing it requires validating article extraction quality, not just compatibility.
- `linkedom` is the closest conceptual replacement if keeping `@mozilla/readability`; risk is compatibility drift on real pages.
- A non-DOM extractor pipeline is possible, but quality regression risk is high without a benchmark corpus.

## Acceptance Checklist (for future implementation)

- `/admin/documents` returns `200` in Vercel production on Node 24 (no `ERR_REQUIRE_ESM`)
- Vercel logs for `/admin/documents` no longer show `jsdom`/`parse5` module load failure
- `/admin/documents` still renders fallback titles correctly for documents missing metadata titles
- Manual URL ingestion still:
  - extracts readable text
  - stores/merges URL metadata
  - resolves favicon (or gracefully falls back to `/favicon.ico`)
- SSR/admin smoke checks pass
- Targeted unit tests pass for URL title derivation and favicon extraction parsing

## Summary (Actionable)

- **Immediate, lowest-risk fix:** decouple `/admin/documents` from `lib/rag/url-metadata.ts` so it does not transitively load `jsdom`.
- **Next best improvement:** replace `lib/rag/fetch-favicon.ts` HTML parsing with a lighter parser (`cheerio` or `htmlparser2`) to reduce server overhead and remove one `jsdom` use case.
- **Defer full `Readability + jsdom` replacement** until you can validate extraction quality against real content samples.
