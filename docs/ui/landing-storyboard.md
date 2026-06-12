# Landing Page — Storyboard & Narrative

**Status:** approved-pending-review · 2026-06-12
**Copy source of truth:** [`content/landing.ts`](../../content/landing.ts) — this document describes how that copy is *staged*; it never duplicates it as authority. If they diverge, `content/landing.ts` wins.
**Design authority:** `jack-h-park-studio-brand-guidelines.md` (workspace root), `styles/jp-theme.css`, `styles/ai-design-system.css`.
**Route:** built at `/landing` first; swaps to `/` after owner confirmation (Notion root → `/work`).

---

## 1 · The Narrative Thesis

The page makes one argument, stated in the hero and proven by everything below it:

> **Structure before execution.**

Every section is a layer of that proof, and the page order *is* the argument's order — the same dependency chain the PM meta-framework describes. The visitor scrolls down the chain the way a decision travels through it:

| Act | Section | Role in the argument |
|-----|---------|----------------------|
| Thesis | 0 · Hero | The claim, stated plainly. |
| System | 1 · The Chain | The structure itself: Philosophy → Principles → Conceptual Models → Execution. |
| Values | 2 · Operating Philosophy | What the structure is made of — four pillars, one heuristic each. |
| Edge | 3 · The Discipline of No | The hardest application of structure: refusal. The emotional center of the page. |
| Proof | 4 · Selected Work | Three 0→1 platforms that the structure produced. |
| Person | 5 · Trajectory | The career that built the structure: architect first, product leader second. |
| Invitation | 6 · Closing | "Let's build something with structure." — the claim returns as an offer. |

**Tone contract (brand §1.3):** calm system, quiet confidence. The page is visually ambitious through *motion choreography and restraint*, never through ornament. No glassmorphism, no neon, no stock imagery. The gradient is a signature, not a wallpaper.

**The page in one sentence per scroll-stop:** a claim → a chain → four beliefs → one refusal → three proofs → one career → one handshake.

---

## 2 · Gradient & Emphasis Budget (page-wide invariants)

The brand allows two gradients, and the page spends them deliberately:

| Asset | Budget | Where it is spent |
|-------|--------|-------------------|
| **Full gradient** (pink→purple→blue→cyan, 90deg) | At most once per surface | **Spent twice across two "surfaces":** (1) the Three.js particle field tint in the hero — a background object, not a UI element; (2) the single Primary CTA in Closing. The hero canvas and the document UI are treated as separate surfaces; if review disagrees, the CTA wins and the particle tint falls back to Mini. |
| **Mini gradient** (purple→blue→cyan) | Interactions only | Link/button hover underlines (notably the "No" underline in §3), the Trajectory scroll-progress line. |
| **2px Full-gradient divider** | Once | Bottom rule of The Chain section — the chain literally "outputs" into the rest of the page. |
| **600 weight** | Logo mark only | Footer wordmark. Headlines use 500. |
| **Animated gradient** | Never on the logo | The JP mark is static everywhere. The Three.js field is a separate object and may move. |

**Color/contrast invariants:** white text never sits on solid cyan (gradient fills OK — brand §3.5). `--brand-pink` on white is ~3:1 — large text and graphic elements only, never body copy.

---

## 3 · Scene-by-Scene Storyboard

Notation: **[V]** visual, **[M]** motion, **[mobile]** ≤768px behavior. All copy keys refer to exports in `content/landing.ts`.

### Scene 0 · Hero — *the claim*

Viewport-height opening. The argument stated before any proof.

- **[V]** Full-bleed, `--bg-page`. Centered column, max-width ~720px. Stack: eyebrow (`hero.eyebrow`, Geist Mono, `--t-eyebrow`, 0.10em tracking, `--text-tertiary`) → headline (`hero.headline`, `--t-display`, Geist 500) → subheadline (`hero.subheadline`, `--t-h3`, `--text-secondary`, with `subheadlineEmphasis` in `--text-primary` 500) → positioning line (`hero.positioning`, `--t-body`) → CTA row (`primaryCta` as bordered secondary button, `secondaryCta` as tertiary link — the Full-gradient primary is reserved for Closing).
- **[V]** Behind the text: the Three.js particle field — one ribbon/field abstracted from the JP monogram's horizontal-bar geometry, tinted by sampling the 4-stop gradient along the x-axis (`gradientUnits="userSpaceOnUse"` logic re-expressed in the shader). Particles drift slowly; mouse parallax ±8px. Low opacity (≤0.35) so text contrast never degrades.
- **[M]** Headline is plain HTML at first paint (LCP). On font-ready, GSAP SplitText splits by line; lines stagger fade-up (y: 24→0, opacity 0→1, 0.08s stagger, `power3.out`, ~0.9s total). Eyebrow fades in first, CTAs last. Three.js hydrates via `next/dynamic` + `requestIdleCallback` *after* the text settles — the canvas fades in under already-readable copy.
- **[M]** Scroll hint: a 1px vertical line below the CTAs that scales-y in a slow loop. Stops at first scroll.
- **[mobile]** Particle count reduced (~1/4) or static pre-rendered fallback; parallax off (no mouse). Headline wraps to 3 lines; type steps down per `--t-*` mobile values. CTA row stacks vertically, 48px min touch targets.

**Beat:** stillness → text arrives in order of importance → the field breathes behind it. Calm, not flashy.

### Scene 1 · The Chain — *the system*

The thesis becomes a diagram. Source: `chain`.

- **[V]** Four nodes laid out vertically (mobile) / as a connected horizontal sequence (desktop): node name in `--t-h2`, its one-liner in `--t-body` `--text-secondary`. Connectors are 1px `--border-default` lines. `chain.outro` ("Each layer is load-bearing.") sits below in `--t-h3`, centered.
- **[M]** ScrollTrigger sequential reveal: each node fades up *and its connector draws in* (scaleX/scaleY 0→1) before the next node appears — the chain visibly *depends* on the previous link. ~0.4s per node, linked to scroll position (scrubbed), not time.
- **[V/M]** Section exit: the **2px Full-gradient divider** draws left→right (scaleX 0→1) as the section completes. This is the page's one structural gradient moment — the chain "powering" everything below.
- **[mobile]** Vertical layout is the native reading order; connectors become short vertical ticks.

**Beat:** the visitor *watches the dependency build*. Skipping ahead in the scroll never shows a node before its parent.

### Scene 2 · Operating Philosophy — *the values*

Four pillars, one killer heuristic each. Source: `pillars`.

- **[V]** 2×2 card grid (desktop), 1-col (mobile). Cards: `--bg-card`, `--border-subtle`, `--radius-lg`, `--shadow-card`. Inside: pillar name (Geist Mono eyebrow style, `--text-tertiary`) → heuristic as the card's *headline* (`--t-h2`, `--text-primary`) → detail (`--t-body`, `--text-secondary`). The heuristic is the hero of each card, not the pillar name.
- **[V]** One outline icon per card (Tabler/Phosphor, 1.5px stroke, 24px, `--text-tertiary`): eye (explainability), refresh/calendar (Day 2), shield-search (adversarial), arrows-exchange (translate risk).
- **[M]** ScrollTrigger batch stagger: cards rise 16px + fade, 0.1s stagger, once (no scrub). Hover: `--shadow-elevated` + 1px border shift to `--ai-accent-soft` — no gradient, no scale.
- **[mobile]** Single column, full-width cards; stagger preserved.

**Beat:** rhythm section — four steady drumbeats after the chain's single line.

### Scene 3 · The Discipline of No — *the edge*

The emotional center. The page slows down here on purpose. Source: `scopeDiscipline`.

- **[V]** Typographic set piece, no cards: `scopeDiscipline.statement` at `--t-h1`, max-width ~640px, generous whitespace above and below (largest vertical padding on the page). The word **"No"** (`emphasisWord`) is a real link-like span: on hover/focus, a **Mini-gradient underline** draws in left→right (the page's signature micro-interaction).
- **[V]** Below: `costsTitle` then the four costs as a sparse two-column list (desktop) / stacked (mobile) — cost name in 500, mechanism in `--text-secondary`. No icons, no boxes; this section refuses decoration the way its content refuses scope.
- **[V]** `scopeDiscipline.closing` as a quiet coda, `--t-body`, `--text-tertiary`.
- **[M]** Statement reveals word-by-word via SplitText with a slow scrubbed ScrollTrigger — the visitor reads it at scroll speed, "No" landing last in the stagger order despite its position. Costs fade in as a group afterwards, minimal.
- **[mobile]** Identical, single column. The hover underline becomes a visible-on-tap (focus) state.

**Beat:** everything else on the page says yes to motion; this section is nearly still. The restraint *is* the message.

### Scene 4 · Selected Work — *the proof*

Three 0→1 platforms. Source: `selectedWork`. Metric scopes are encoded in the copy file; internal `b2b-solution-service` figures are owner-approved (2026-06-12).

- **[V]** Three full-width horizontal cards stacked vertically (desktop & mobile — not a 3-col grid; each card deserves a full read). Card anatomy: index numeral (`01`, Geist Mono, `--text-tertiary`) → title (`--t-h2`) → role line (Geist Mono caption) → description (`--t-body`) → stat row.
- **[V]** Stats: value in `--t-display`-adjacent size, Geist 500, `--text-primary`; label beneath in `--t-caption` `--text-secondary`. No gradient on numbers.
- **[M]** GSAP count-up on each stat when the card enters the viewport (once, ~1.2s, `power2.out`, respecting `prefix`/`suffix`/decimals — 11.5 must not animate as integers). Card itself: simple fade-up.
- **[M]** Card hover: title gets a Mini-gradient underline (consistent with §3's "No"); card border shifts to `--ai-accent-soft`. Whole card is the link (`card.href` → `/work`, `/chat`).
- **[mobile]** Stat row wraps 3→2+1; count-up duration unchanged.

**Beat:** after the philosophy, numbers land with weight precisely because the page has earned them slowly.

### Scene 5 · Trajectory — *the person*

Career as a vertical timeline. Source: `trajectory`.

- **[V]** Left rail: a 2px track in `--border-default`; inside it, a **Mini-gradient progress line** that fills top→bottom scrubbed to scroll — the visitor's scroll position *is* the career position. Milestones on the right: period (Geist Mono, `--text-tertiary`) → org (500) → role (`--text-secondary`). Education as two compact entries after the milestones, visually subordinate.
- **[M]** Each milestone node (6px dot on the rail) "lights" (border→`--brand-blue`) as the progress line passes it; milestone text fades in at the same trigger. Scrubbed, reversible.
- **[mobile]** Same layout (vertical timelines are natively mobile); rail moves to far left, text takes remaining width.

**Beat:** the only scrubbed-throughout section — time under the reader's thumb.

### Scene 6 · Closing — *the invitation*

Source: `closing`.

- **[V]** Centered: `closing.headline` at `--t-h1` → the **Primary CTA** (`closing.cta`): Full-gradient fill, white text, `--radius-md`, padding 10px 18px, Geist 500 13px — *the page's single Full-gradient interaction and only primary button* (brand §5.4).
- **[V]** Footer: wordmark lockup per brand §2.4 — "Jack H. Park" Geist 500, −0.025em; "STUDIO" Geist Mono 400, 11px, 0.20em tracking, uppercase. Social links from `site.config.ts` (LinkedIn, GitHub, Instagram, YouTube) as outline icons, 1.5px stroke, `--text-tertiary` → Mini-gradient underline on hover. The mark is static (never animated).
- **[M]** Headline fade-up once; CTA gets a subtle scale-in (0.96→1). Nothing loops, nothing pulses.
- **[mobile]** CTA full-width up to 360px, 48px height; footer stacks.

**Beat:** the thesis returns as a handshake. Quietest exit possible after the proof.

---

## 4 · Motion System (page-wide spec)

| Parameter | Value |
|-----------|-------|
| Library | GSAP ≥3.13 (SplitText + ScrollTrigger, free since 3.13) |
| Easing vocabulary | `power3.out` for entrances, `power2.out` for count-ups, `none` for scrubbed tweens |
| Entrance distance | 16–24px translate-y, never more |
| Durations | 0.4–0.9s entrances; scrubbed sections have no duration (scroll-linked) |
| Triggers | Scenes 1, 3 (statement), 5 = scrubbed; Scenes 2, 4, 6 = play-once on enter |
| Reduced motion | `gsap.matchMedia('(prefers-reduced-motion: reduce)')`: all tweens jump to end state, count-ups render final values, Three.js renders a single static frame (no rAF loop), scroll hint hidden |
| Performance | Single rAF (GSAP ticker drives Three.js camera too); hero rAF stops via IntersectionObserver when canvas <1% visible; `will-change` only during active tweens |
| CLS guard | SplitText runs after `document.fonts.ready`; split targets reserve their final box (`visibility` not `display` toggling) |

## 5 · Three.js Hero Spec (Scene 0 detail)

- One `Points` object (~3,000 particles desktop / ~800 mobile), positions seeded from the JP monogram's bar-and-glyph silhouette then relaxed into a loose field — *abstracted from*, never *rendering*, the logo (the logo no-animate rule applies to the mark, not this field).
- Custom `ShaderMaterial`: per-particle color = 4-stop gradient sampled by normalized x (stop values read from `--brand-*` tokens at init, not hard-coded — guardrail-compliant since they live in JS, but still token-sourced).
- Motion: slow curl-noise drift (~0.02 units/s) + mouse parallax (lerped, ±8px world units). No bloom, no postprocessing — "calm system."
- Loading: `next/dynamic({ ssr: false })`, mounted on `requestIdleCallback` (fallback `setTimeout 200ms`); until then a static CSS radial wash in `--ai-accent-bg` holds the space (also the permanent fallback for reduced-motion / WebGL-unavailable / mobile-low-power).

## 6 · Type & Token Plumbing (prerequisite, from repo review)

- The landing root wraps in `data-theme="jp"` — `--t-*`, `--radius-*`, `--font-*` tokens exist only under that scope (`styles/jp-theme.css`).
- Geist Sans/Mono via a shared `next/font` module extracted from `components/admin/layout/AdminPageShell.tsx` (currently admin/chat-only).
- All landing CSS in `components/landing/*.module.css`, token-only, each file registered in `featureCssFiles` in `scripts/check-css-guardrails.mjs`.
- Dark mode: `#191919` base via existing DarkModeProvider; every scene re-checked in dark (particle opacity especially).

## 7 · Open Items

1. **Full-gradient double-spend ruling** (§2): hero particle tint + closing CTA. Recommended reading: canvas background ≠ UI surface, so both stand. If rejected → particle field falls back to Mini gradient.
2. `/landing` → `/` swap timing (owner deferred; includes sitemap + `work`-slug collision check).
3. OG image per brand §7.3 — after visual lock (Phase 5).
