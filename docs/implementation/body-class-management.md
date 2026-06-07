# Body Class Management — Pattern & Rationale

## TL;DR

Never use `react-body-classname` (the `BodyClassName` component) for classes that must persist across client-side page transitions. Always manage those classes at the `_app` or provider level.

---

## Background

`react-body-classname` tracks all mounted `BodyClassName` instances in a shared static cache (`BodyClassName.cache`). When the last instance unmounts it calls `handleStateChangeOnClient("")`, which **removes every class it has ever managed from `document.body`** in one synchronous write. Since `NotionPage` (which hosted all `BodyClassName` nodes) unmounts on every page transition, this caused a one-frame flash where the body lacked `dark`, `dark-mode`, and `notion-polish-*` — reverting backgrounds and colors to light-mode defaults.

The package was removed from `NotionPage` entirely in commit `42fbf6d`.

---

## Current ownership table

| Body class | Owner | Persistence |
|---|---|---|
| `dark` | `DarkModeProvider.tsx` via `classList.toggle` | Permanent (provider never unmounts) |
| `dark-mode` | `DarkModeProvider.tsx` via `classList.toggle` | Permanent |
| `notion-polish-{profile}` | `pages/_app.tsx` via one-time `useEffect` | Permanent (app never unmounts) |
| `notion-lite` | `NotionPage.tsx` via `useEffect` + cleanup | Page-scoped (correct — only applies when `?lite=true`) |

### Initial HTML (SSR / no-flash)

`pages/_document.tsx` contains an inline `<script>` that reads `localStorage.darkMode` synchronously before React hydrates and sets `dark` + `dark-mode` on `document.body`. This prevents the dark-mode flash on first load. No equivalent is needed for `notion-polish-*` because that class is always the same value (`balanced`) and has no visible effect before hydration.

---

## Rules

1. **Stable body classes** (dark theme, layout profile, global feature flags) → apply in `DarkModeProvider` or `_app.tsx` with a plain `classList` call. No cleanup needed; they should live for the entire browser session.

2. **Page-scoped body classes** (e.g. `notion-lite` for oembed) → apply in the page component with `useEffect` **and a cleanup function** so the class is removed when the user navigates away.

3. **Never** store body classes in `react-body-classname` or any library whose teardown removes classes on component unmount, unless the component is guaranteed to live for the full session (i.e. lives in `_app`).

---

## Code reference

### `DarkModeProvider.tsx`

```tsx
React.useEffect(() => {
  document.body.classList.toggle("dark", darkMode.value);
  document.body.classList.toggle("dark-mode", darkMode.value);
}, [darkMode.value]);
```

### `pages/_app.tsx`

```tsx
useEffect(() => {
  // No cleanup — notion-polish-* must persist for the entire session.
  document.body.classList.add(`notion-polish-${notionPolishProfile}`);
}, []);
```

### `NotionPage.tsx` (page-scoped)

```tsx
React.useEffect(() => {
  if (!isLiteMode) return;
  document.body.classList.add("notion-lite");
  return () => {
    document.body.classList.remove("notion-lite");
  };
}, [isLiteMode]);
```

---

## Related

- Incident writeup: `docs/incidents/mobile-ux-and-navigation-fixes-2026-06.md` — Bug 5c
- CSS rules that depend on `dark` / `dark-mode`: `styles/global.css:131`, `styles/notion-parity.css:63+`
- `notion-polish-*` feature matrix: `docs/ui/notion-polish-matrix.md`
