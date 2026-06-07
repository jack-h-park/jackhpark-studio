# Mobile UX & Back-Navigation Bug Fixes — 2026-06

## Overview

Five production bugs discovered and fixed across mobile UX and client-side navigation. Each bug is documented with root cause, affected files, and the specific commit that resolved it.

---

## Bug 1 — Mobile hamburger menu (nav links overlap)

**Symptom**: On mobile viewports the header nav links overlapped the breadcrumb and were unscrollable, making them impossible to click.

**Root cause**: All nav links were rendered inline in the `notion-nav-header` flex row without collapsing on small viewports. No mobile-specific menu existed.

**Fix**:
- Created `components/NotionPageHeader.module.css` with `.navLinks` (hidden on ≤767 px), `.hamburger` (shown on ≤767 px), `.mobileMenu` (position: fixed, z-index: 200), and `.backdrop` (dimmed overlay).
- Added `isMobileMenuOpen` state to `NotionPageHeader.tsx`.
- **Important**: the mobile menu + backdrop are rendered in a React `<>` fragment *outside* the `<header>` element. `<header>` has `backdrop-filter: blur`, which creates a new CSS containing block and breaks `position: fixed` children if they live inside it.

**Commit**: `5aea69c`

---

## Bug 2 — Inline database items not clickable on mobile

**Symptom**: Notion inline database rows rendered correctly on mobile but none of the items responded to taps.

**Root cause**: `ChatFloatingWidget`'s container `div` was `position: fixed; z-index: 1000; pointer-events: auto` and was sized by its children (button + chat panel). On a 375 × 812 viewport the container measured ≈ 343 × 644 px, covering most of the screen — including the inline database. `pointer-events: none` on a child does not propagate upward, so the container remained a hit-test target even when the chat panel was closed.

Verified with `document.elementsFromPoint(x, y)` in the browser console: `ChatFloatingWidget_container` was the topmost element at the link's coordinates.

**Fix** (`components/chat/ChatFloatingWidget.module.css`):
```css
.container {
  pointer-events: none; /* pass all events through to page content */
}
.button {
  pointer-events: auto; /* re-enable only on the interactive element */
}
```

Secondary improvement: added `touch-action: manipulation` to `.notion-table-cell` and `.notion-table-cell-title .notion-page-link` in `styles/notion-parity.css` to prevent iOS Safari's 300 ms tap delay.

**Commit**: `45aa390`

---

## Bug 3 — API 400 "no low surrogate in string"

**Symptom**: The Anthropic API returned HTTP 400 with `"no low surrogate in string"` when Notion page content contained lone UTF-16 surrogate characters (U+D800–U+DFFF without a valid pair). These arise from corrupted Notion data and survive JSON parsing in Node.js but cause `JSON.stringify` to produce invalid JSON.

**Fix** (`lib/server/api/chat-stream-answer.ts`):

```ts
function sanitizeLoneSurrogates(str: string): string {
  return str.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "�",
  );
}
```

Applied to `question`, `contextValue`, and `memoryValue` before `answerChain.invoke()`.

**Commit**: `6236811`

---

## Bug 4 — SidePeek (list-type inline DB) unclosable on mobile

**Symptom**: Opening a list-type inline database item opened a bottom-sheet `SidePeek`. On mobile the sheet could never be closed.

**Root cause** — three compounding issues:

| Issue | Detail |
|---|---|
| Panel was `height: 100vh` | The full-screen panel completely covered the dim overlay behind it. Tapping "outside" was impossible. |
| Drag handle was 5 px tall | `div.dragHandle` had `height: 5px` — impossible to reliably tap on a touch screen. Only the handle initiated the framer-motion `dragControls`, so swipe-to-dismiss never triggered. |
| Dead `y` motion value | `useMotionValue(y)` and `useTransform(opacity)` were created but `style={{ y }}` was never set on the panel, so the overlay opacity never reflected drag position. |

**Fix** (`components/SidePeek.module.css` + `components/SidePeek.tsx`):

- Panel changed to `height: 90vh` with `top: auto` so it is bottom-anchored. The top 10 vh shows the dimmed overlay → tapping there dismisses the sheet.
- Drag pill wrapped in a `.dragHandleArea` container: `width: 100%; height: 40px; touch-action: none`. This gives a full-width, 40 px tall touch target. `touch-action: none` is required here so framer-motion's `dragControls` can receive the pointer-down event without the browser intercepting it for native pan.
- Removed dead `useMotionValue` / `useTransform` imports and calls; overlay uses framer-motion `animate` / `exit` transitions directly.

**Commit**: `459b6e7`

---

## Bug 5 — Full-screen flash + scroll reset on back navigation

**Symptom**: Pressing the browser back button to return to the home page caused: (a) a full-screen white flash, (b) scroll position always reset to the top, (c) slow perceived load.

### 5a — Scroll reset

**Root cause**: `next.config.js` had no `experimental.scrollRestoration` flag. Without it, Next.js Pages Router forces `history.scrollRestoration = 'manual'` and calls `window.scrollTo(0, 0)` on every navigation including `popstate`, overriding native browser scroll restoration.

**Fix** (`next.config.js`):
```js
experimental: {
  externalDir: true,
  scrollRestoration: true,
},
```

Next.js saves `{ x, y }` to `sessionStorage` before each `router.push()` and restores it in the `popstate` handler. Verified the flag maps to `process.env.__NEXT_SCROLL_RESTORATION` which the router reads at `router.js:213`.

### 5b — Loading flash on ungenerated pages

**Root cause**: `getStaticPaths` used `fallback: true`. When a page URL that hadn't been pre-rendered at build time was visited for the first time, Next.js rendered the `<Loading />` spinner (`NotionPage.tsx:948`) while it fetched `getStaticProps` data. On back navigation with a cold route cache, this fallback state briefly re-appeared.

**Fix** (`pages/[pageId].tsx`): All three `fallback: true` values changed to `fallback: 'blocking'`. The server now generates the page before responding; the client never sees a loading state.

### 5c — Full-screen white flash (primary cause)

**Root cause**: `react-body-classname` (`BodyClassName` component) maintains a **single shared class cache** (`BodyClassName.cache`). Three instances lived inside `NotionPage`:

```tsx
{isLiteMode && <BodyClassName className="notion-lite" />}
{isDarkMode && <BodyClassName className="dark dark-mode" />}
<BodyClassName className={`notion-polish-${config.notionPolishProfile}`} />
```

When `NotionPage` unmounts during navigation, `react-body-classname` fires `handleStateChangeOnClient("")`:

```js
BodyClassName.cache = newClassNames;  // → []
document.body.className = currentClassNames.concat(newClassNames).join(' ');
// "current" = body classes NOT in cache → removes dark, dark-mode, notion-polish-balanced
```

CSS rules like `.dark { --bg-color: #191919 }` immediately deactivate. The body background reverts to `#fff`. One frame later the new `NotionPage` remounts and re-adds the classes, but the browser has already painted the white frame — visible as a flash.

**Fix** (three files):

| File | Change |
|---|---|
| `components/DarkModeProvider.tsx` | Toggle `dark-mode` alongside `dark`. Provider lives in `_app` and never unmounts. |
| `pages/_app.tsx` | `useEffect(() => { document.body.classList.add('notion-polish-...') }, [])` — runs once, persists for the session. |
| `components/NotionPage.tsx` | Removed `import BodyClassName` and all three `<BodyClassName>` JSX nodes. `notion-lite` replaced with a direct `useEffect` + cleanup (page-scoped; safe to add/remove). |

**Commits**: `d396376` (scrollRestoration + fallback), `88731b1` (revalidate 10→60), `42fbf6d` (flash fix)

---

## Revalidate increase (bonus)

`revalidate: 10` meant the `/_next/data/` endpoint expired every 10 seconds, causing frequent background re-validations that contributed to perceived slowness. Increased to `revalidate: 60` in both `pages/index.tsx` and `pages/[pageId].tsx`. Portfolio content does not change faster than once a minute in normal use.

**Commit**: `88731b1`

---

## Key architectural invariants established

1. **`position: fixed` children must not live inside `backdrop-filter` parents** — the filter creates a new containing block that breaks viewport-relative positioning.
2. **`pointer-events: none` on a child does not fix the parent** — always set `pointer-events: none` on the container and `pointer-events: auto` on interactive children when a fixed overlay covers the page.
3. **`react-body-classname` removes classes on unmount** — do not use it for body classes that must survive page transitions. Manage those at `_app` / provider level via direct `classList` calls.
4. **framer-motion `drag` + `dragListener: false`** — the drag handle container needs `touch-action: none`; the panel itself should use `touch-action: pan-y` so inner content remains scrollable.
