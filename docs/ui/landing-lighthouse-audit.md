# Landing Page — Lighthouse Audit

**Date:** 2026-06-15 (baseline at `/landing`) · **2026-06-16 update** below (after promotion to `/`)
**URL measured:** `https://www.jackhpark.com/landing` (baseline) → `https://www.jackhpark.com/` (post-promotion). The apex `jackhpark.com` 307-redirects to `www`.
**Tool:** Lighthouse 12.8.2 (local CLI via `npx lighthouse`, headless Chrome)
**Why production:** Lighthouse numbers are only meaningful against a deployed production build; local `next dev` figures are not comparable (no minification, dev-only overhead, HMR).

---

## 0 · Post-atmospheric result (2026-07-03, `/`)

After the award-worthy pass (motion elevation + atmospheric visual direction: ambient WebGL field, per-section hue shift, section rail, full-height outro; maximal removed — storyboard §8). Re-measured at `https://www.jackhpark.com/`:

| Category | Mobile | Desktop |
|----------|:------:|:-------:|
| Performance | 92 | 98 |
| Accessibility | 95 | 95 |
| Best Practices | 100 | 100 |
| **SEO** | **100** | **100** |

**All targets held** — the atmospheric layer did not regress performance (mobile still 92: LCP 3.2s · TBT ~100ms · CLS 0). A first post-deploy run read **36** (LCP 10.2s, TBT 1,640ms) from a cold serverless start + local CPU contention; two warm re-runs both returned 92 — so measure warm. The lone accessibility deduction is the SplitText `aria-label` on the scope statement (`aria-prohibited-attr`) — net-positive for screen readers, not a real defect.

### Post-promotion result (2026-06-16, `/`)

The landing was promoted to `/` and `noindex` removed (`landing-storyboard.md` §7): Mobile 92 / Desktop 99, A11y 91/95, BP 100, **SEO 63 → 100**. Mobile settled at 92 across repeat runs (a first run read 64 from cold-start, not a regression).

---

## 1 · Scores

| Category | Mobile | Desktop |
|----------|:------:|:-------:|
| Performance | **99** | **90** |
| Accessibility | 91 → **expected ~100 after fixes**¹ | 95 |
| Best Practices | **100** | **100** |
| SEO | 63² | 63² |

Core metrics (mobile): FCP 1.1s · LCP 1.4s · TBT 80ms · CLS 0.003 · Speed Index 3.3s
Core metrics (desktop): FCP 0.4s · LCP 1.9s · TBT 0ms · CLS 0.028 · Speed Index 1.3s

Performance is strong for a GSAP + Three.js page — the deferred (`next/dynamic` + idle) Three.js mount keeps it out of the critical path, so LCP/TBT stay low.

¹ See §3 — the real contrast issues were fixed; remaining a11y deductions are an intentional library behavior and a measurement artifact.
² SEO is gated by a single intentional flag — see §2.

---

## 2 · SEO 63 — intentional, not a defect

The only SEO failure is **"Page is blocked from indexing"**, caused by the temporary
`<meta name="robots" content="noindex">` on `pages/landing.tsx`. `/landing` is a staging
route; the tag is deliberate until the page is promoted to `/`.

**Resolution:** ✓ **Done (2026-06-16)** — promoted to `/`, `noindex` removed, SEO now 100 (see §0).

---

## 3 · Accessibility — findings & resolution

Lighthouse flagged three distinct issues; only one was a genuine, persistent defect.

| # | Finding | Verdict | Action |
|---|---------|---------|--------|
| A | **Color contrast** — `--text-tertiary` (#9b9a97) on white = **2.81:1** (below AA 4.5:1) on the 11–12px mono labels: section eyebrows, footer `STUDIO` tag, card role lines, timeline periods. | **Real defect** | **Fixed** — bumped these classes to `--text-secondary` (#6b6a65 on white ≈ 5:1, passes AA; dark mode already passed). Classes: `.eyebrow`/`.sectionTitle`, `.studioTag`, `.workRole`, `.timelinePeriod` in `components/landing/landing.module.css`. |
| B | **Prohibited ARIA attribute** — GSAP `SplitText` adds `aria-label` to the scope-statement `<p>` (no valid role), which axe flags. | **Library behavior** | **Not changed** — `SplitText` adds `aria-label` precisely to preserve the readable string for screen readers while the visible text is split into spans. Removing it would *harm* accessibility. Net effect is positive; the axe rule is overly strict here. |
| C | **Contrast on `opacity: 0.12` text** — ~20 nodes, all `aria-hidden="true"`, at very low opacity. | **Measurement artifact** | **Not changed** — these are split pieces of the scrubbed scope-statement reveal, captured mid-animation (before scroll) at 0.12 opacity. They are decorative and `aria-hidden`; a reading user never sees low-contrast persistent text. Not a real failure. |

Note on capture coverage: card role lines and timeline periods were **not** in the raw
Lighthouse report because those sections were GSAP-hidden (`opacity: 0`) at capture, so
axe skipped them. They share token A's identical contrast problem, so they were fixed in
the same pass to avoid a latent failure once those sections animate in.

---

## 4 · How to re-run

```sh
# Canonical production URL (apex redirects to www).
URL="https://www.jackhpark.com/landing"
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Mobile (default emulation/throttling — the stricter, primary score):
npx lighthouse@12 "$URL" --quiet \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new" --output=html --output-path=./lh-mobile.html

# Desktop:
npx lighthouse@12 "$URL" --quiet --preset=desktop \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new" --output=html --output-path=./lh-desktop.html
```

PageSpeed Insights API (`pagespeedonline/v5/runPagespeed`) also runs Lighthouse but the
anonymous quota is shared/exhausted; the local CLI above is the reliable path.

---

## 5 · Re-measure after these milestones

- ~~**Route promotion** (`/landing` → `/`, remove `noindex`)~~ ✓ Done 2026-06-16 — SEO 100 (§0).
- **Any Three.js / GSAP change**: re-check mobile Performance and TBT.
- Targets to hold: Performance ≥ 90 (both), Accessibility ≥ 95, Best Practices 100,
  SEO ≥ 95 (post-promotion).
