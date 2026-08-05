# Jack H. Park Studio — Brand Guidelines

> **Note — moved into version control (was a loose file at the workspace root).**
> The canonical, human-facing brand guide is the richer published page
> [`public/assets/brand-design-system-guide.html`](../public/assets/brand-design-system-guide.html)
> (live component demos, newer). This markdown is the original **source spec**, preserved
> here. The design tokens' machine-readable source lives in the `jhp-studio-design-system`
> design project.

**Version 1.0** · 2026-05-27 · Owner: Jack H. Park

> A personal studio of work, ideas, and experiments — crafting products, sharing stories, and exploring curiosity.

---

## 0 · How to use this document

This guide is the single source of truth for the Jack H. Park Studio visual identity. Use it when designing slides, writing emails, building product surfaces, or commissioning external work. Every value below is a token — copy it as-is.

When in doubt: **the system is quiet by default, the signature appears once per surface, and the logo is never reconstructed by hand.**

---

## 1 · Foundation

### 1.1 Positioning

Jack H. Park Studio is the personal studio of a product leader specializing in enterprise SaaS and security platforms, grounded in a strong software engineering foundation. The brand operates at the intersection of technology and strategy — combining a hands-on mindset with a bird's-eye view to transform complex enterprise challenges into scalable products with measurable business impact.

### 1.2 Brand personality

| Trait | Means | Does not mean |
|---|---|---|
| Considered | Each decision is reasoned and documented | Slow or precious |
| Technical | Speaks fluently to engineers and PMs | Cold or impenetrable |
| Honest | Says what works and what does not | Blunt or careless |
| Curious | Treats every problem as worth exploring | Unfocused or fashionable |

### 1.3 Voice and tone

Write in plain, declarative English. Prefer specific nouns to abstract ones. Lead with the thing itself, not with framing.

**Do.** "I lead enterprise security platforms from 0 to 1 through global growth."

**Avoid.** "I am passionate about leveraging my expertise to drive transformative outcomes."

When the surface is internal or technical (specs, README, code comments), the voice may compress to telegrams. When the surface is external (website, deck, email), the voice opens up to natural sentences with a craftsperson's attention to specificity.

### 1.4 The signature gradient — what it stands for

The four-stop gradient — pink, purple, blue, cyan — is the only ornamental decision in the system. It carries the human, expressive layer of the brand: a Korean designer's identity, the lightning of the JP wordmark, the warmth of personal work, anchored by the blue and cyan of enterprise technology. Use it sparingly; let it be a signature, not a wallpaper.

---

## 2 · Logo system

### 2.1 The mark

The primary mark is a J-P monogram in which the letter H of the initials JHP is absorbed as a hyphen connecting J and P. Read aloud, it remains "J-H-P." Seen on the page, it reads as "J · — · P" — a visual sentence that connects rather than separates.

The hyphen sits slightly below the optical cap-mid, touching the J on the left while leaving a small kerned gap before the P on the right. This asymmetry is intentional. It evokes the Korean vowel "ㅏ" (a) — a quiet reference to the designer's heritage encoded in the geometry of the mark itself, not in its color or ornament.

### 2.2 Construction (locked tokens)

| Token | Value |
|---|---|
| viewBox | `0 0 120 100` |
| Font | Geist Sans 600 |
| Font size | 100 |
| Letter-spacing | -4 |
| J position | `x=0, y=78` |
| P position | `x=55, y=78` |
| Hyphen size | `22 × 12, rx=1.5` |
| Hyphen x-center | midpoint of `(J.bbox.x + 0.80×w)` and `(P.bbox.x + 0.08×w)` |
| Hyphen y-center | `J.bbox.y + J.bbox.height / 2 + 1.2` |
| Gradient | `gradientUnits="userSpaceOnUse" x1=0 x2=120` for color continuity across glyphs |

### 2.3 The reference SVG

```svg
<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brandGradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="120" y2="0">
      <stop offset="0%" stop-color="#f06292"/>
      <stop offset="30%" stop-color="#b439df"/>
      <stop offset="60%" stop-color="#5b8def"/>
      <stop offset="100%" stop-color="#4dd0e1"/>
    </linearGradient>
  </defs>
  <text x="0" y="78"
        font-family="Geist, ui-sans-serif, -apple-system, sans-serif"
        font-weight="600" font-size="100" letter-spacing="-4"
        fill="url(#brandGradient)">J</text>
  <!-- hyphen x and y are computed at render time from J and P bbox; see 2.2 -->
  <rect width="22" height="12" rx="1.5" fill="url(#brandGradient)"/>
  <text x="55" y="78"
        font-family="Geist, ui-sans-serif, -apple-system, sans-serif"
        font-weight="600" font-size="100" letter-spacing="-4"
        fill="url(#brandGradient)">P</text>
</svg>
```

The hyphen rectangle's `x` and `y` attributes must be computed at render time from the actual bounding boxes of J and P using the formulas in §2.2. This is non-negotiable — fonts render with subpixel variation across browsers and operating systems, and a hardcoded position will drift.

### 2.4 Variants

**Primary on light.** Gradient fill on white background. Default for documents, light-mode UI, business cards.

**Primary on dark.** Same gradient fill on `#191919`. Default for dark-mode UI, slide covers, photographs.

**Filled icon mark.** A rounded square (`border-radius: 14px` at 72px, scales proportionally) filled with the diagonal `135deg` version of the gradient. The monogram inside is white. Use for favicons, app icons, avatars, anywhere the mark needs to read as a unified shape.

**Workmark.** "Jack H. Park" in Geist 500 with `letter-spacing: -0.025em`, followed by "Studio" in Geist Mono 400 with `letter-spacing: 0.20em` at the same baseline. For long-form lockups, the word "Studio" inherits the gradient via background-clip; "Jack H. Park" stays in `--text-primary`.

### 2.5 Combined lockup

The primary lockup pairs the filled icon mark with the workmark, vertically centered.

| Slot | Size at 72px icon | Spacing |
|---|---|---|
| Icon | 72 × 72, radius 14 | — |
| Gap between icon and text | 14px | — |
| Wordmark line 1 ("Jack H. Park") | Geist 500, 19px | letter-spacing -0.025em |
| Wordmark line 2 ("STUDIO") | Geist Mono 400, 11px | letter-spacing 0.20em |

### 2.6 Clear space

Minimum clear space around any mark equals the height of the hyphen (12 viewBox units, which scales with the mark). At icon size 72px, that is 8.4px of clear space on all sides. At icon size 32px, that is 3.7px. The mark should never touch another element within this zone.

### 2.7 Minimum sizes

| Surface | Minimum |
|---|---|
| Filled icon mark (square) | 16px |
| Primary monogram (gradient on bg) | 24px width |
| Combined lockup | 32px icon height |
| Workmark alone | 11px line-height ("STUDIO" subline becomes optional below this) |

### 2.8 Don'ts

- Do not reconstruct the monogram by hand. Always use the reference SVG with computed hyphen position.
- Do not change the gradient direction in the primary monogram (must be horizontal, `userSpaceOnUse`).
- Do not place the gradient mark on a colored background. Light, dark, or filled-icon only.
- Do not animate the gradient. The mark is stable.
- Do not stretch, skew, or outline the mark.
- Do not place the monogram and the workmark with the gradient applied simultaneously — only one element in the lockup carries the gradient.

---

## 3 · Color system

### 3.1 Brand colors

| Token | Hex | Notes |
|---|---|---|
| `--brand-pink` | `#f06292` | Warm anchor — JP heritage |
| `--brand-purple` | `#b439df` | Bridge — the only color shared between Full and Mini |
| `--brand-blue` | `#5b8def` | Trust anchor — enterprise, security |
| `--brand-cyan` | `#4dd0e1` | Cool exit — calm, technological |

### 3.2 Gradients — the only two

**Full signature.** Use only where the brand needs to be felt at first contact.

```
linear-gradient(90deg,
  #f06292 0%,
  #b439df 30%,
  #5b8def 60%,
  #4dd0e1 100%
)
```

Applications: logo, slide covers, OG images, the single primary CTA per page, business card accent.

**Mini signature.** Use where Full would overpower. Subset of Full — the cool half only.

```
linear-gradient(90deg,
  #b439df 0%,
  #5b8def 50%,
  #4dd0e1 100%
)
```

Applications: link hover underlines, focus rings, small toggles, in-text emphasis on a single word.

**Rule.** No surface contains more than one instance of Full at once. Mini may repeat as long as each instance is contained within an interaction (a single link, a single button).

### 3.3 Neutrals — Notion ink foundation

The neutrals come from Notion's own design language. They are warm, never pure black or pure white, and they auto-adapt between light and dark.

| Token | Light | Dark |
|---|---|---|
| `--bg-page` | `#FFFFFF` | `#191919` |
| `--bg-surface` | `#F7F6F3` | `#252525` |
| `--bg-card` | `#FFFFFF` | `#252525` |
| `--text-primary` | `#37352F` | `#F2F0EA` |
| `--text-secondary` | `#6B6A65` | `#B4B2A9` |
| `--text-tertiary` | `#9B9A97` | `#9B9A97` |
| `--border-subtle` | `rgba(55,53,47,0.09)` | `rgba(255,255,255,0.10)` |
| `--border-default` | `#EFEEEA` | `#2A2A2A` |

### 3.4 Semantic colors

These are status tokens, not brand tokens. They communicate state in UI surfaces and inherit from Notion's palette so that content authored in Notion renders consistently on the public site.

| Token | Light | Dark |
|---|---|---|
| `--accent-info` | `#0B6E99` | `#529CCA` |
| `--accent-success` | `#3B6D11` | `#97C459` |
| `--accent-warning` | `#BA7517` | `#FFA344` |
| `--accent-danger` | `#A32D2D` | `#FF7369` |

### 3.5 Accessibility

All foreground/background combinations must meet WCAG 2.1 AA contrast (4.5:1 for body, 3:1 for large text). Verified pairings:

| Foreground | Background | Contrast | Pass |
|---|---|---|---|
| `--text-primary` light | `--bg-page` light | 12.9:1 | AAA |
| `--text-secondary` light | `--bg-page` light | 6.4:1 | AAA |
| `--text-primary` dark | `--bg-page` dark | 13.2:1 | AAA |
| White on `--brand-purple` | — | 4.8:1 | AA |
| White on `--brand-blue` | — | 3.1:1 | AA large |
| White on `--brand-cyan` | — | 2.4:1 | **Fail** — never place white text on cyan alone; the gradient compensates because pink and purple do pass |

When using the Full gradient as a button fill, white text is acceptable because the perceived contrast is dominated by the purple-pink portion. Do not place white text on a solid cyan button.

---

## 4 · Typography

### 4.1 Type families

| Token | Family | Source |
|---|---|---|
| `--font-sans` | Geist, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif | vercel.com/font/sans |
| `--font-mono` | "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace | vercel.com/font/mono |

Geist is Vercel's open-source typeface family released in 2023. It is free for commercial use. Both Sans and Mono support the same weights and metrics, which keeps the system coherent.

System fallbacks are listed for environments where Geist cannot be loaded (email clients, native PDF readers). The fallback chain ensures that the document is always readable even when the brand font is unavailable.

### 4.2 Weights

The system uses three weights only.

| Weight | Use |
|---|---|
| 400 (Regular) | All body copy, captions, monospace labels |
| 500 (Medium) | Headings, button labels, navigation links |
| 600 (Semibold) | Logo monogram only |

Bold (700) and lighter weights (300, 200) are not used. They break the calm, considered tone of the system.

### 4.3 Type scale

| Style | Size | Line-height | Tracking | Family | Weight |
|---|---|---|---|---|---|
| `display` | 40px | 1.12 | -0.025em | sans | 500 |
| `h1` | 28px | 1.18 | -0.02em | sans | 500 |
| `h2` | 22px | 1.25 | -0.015em | sans | 500 |
| `h3` | 18px | 1.35 | -0.01em | sans | 500 |
| `body` | 14px | 1.65 | 0 | sans | 400 |
| `caption` | 12px | 1.5 | 0 | sans | 400 |
| `eyebrow` | 11px | 1.4 | 0.10em uppercase | sans | 500 |
| `mono` | 12px | 1.5 | 0 | mono | 400 |
| `studio-tag` | 11px | 1.0 | 0.20em uppercase | mono | 400 |

### 4.4 The "Studio" tag

The word "STUDIO" appears in Geist Mono, 11px, uppercase, with `letter-spacing: 0.20em`. This treatment is reserved for the workmark and for footer signatures. It is the system's only italicized-feeling moment — the wide tracking creates a quiet emphasis that distinguishes the studio name from "Jack H. Park" the person.

---

## 5 · Components

### 5.1 Spacing scale

Four-base scale. Use only these values.

| Token | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |
| `--space-7` | 48px |
| `--space-8` | 64px |

### 5.2 Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | chips, tags, status pills |
| `--radius-md` | 10px | input, button, small cards |
| `--radius-lg` | 14px | cards, content blocks, icon containers |
| `--radius-xl` | 24px | hero blocks, large icon containers |
| `--radius-pill` | 999px | true pill shapes only |

### 5.3 Elevation

| Token | Value |
|---|---|
| `--shadow-card` | `0 1px 2px rgba(15,15,15,0.04), 0 4px 12px rgba(15,15,15,0.05)` |
| `--shadow-elevated` | `0 10px 20px rgba(15,15,15,0.05)` |
| `--shadow-popover` | `0 18px 35px rgba(15,15,15,0.08)` |
| `--shadow-card-dark` | `0 1px 2px rgba(0,0,0,0.30), 0 4px 12px rgba(0,0,0,0.40)` |

### 5.4 Buttons

**Primary.** Full gradient fill, white text, `--radius-md`, padding `10px 18px`, label in Geist 500 13px. There is at most one primary button per page.

**Secondary.** Transparent fill, 0.5px border in `--border-default`, text in `--text-primary`, same radius and padding. Hover: background fades to `--bg-surface`.

**Tertiary.** Text-only, no border. Underline appears on hover using the Mini gradient.

### 5.5 Cards

All cards use `--bg-card`, `--radius-lg`, 0.5px `--border-default`, padding `20px`. Headings inside a card use h3. Body text inside uses `body`. Cards never carry the gradient as a background — the gradient lives on logos, hero blocks, and the single primary CTA.

### 5.6 Status pills

Status pills inherit Notion's color tokens directly so that content tagged in Notion renders identically on the public site. Each pill is `font: 11px sans 400`, `padding: 2px 8px`, `radius: --radius-sm`. See §3.4 for color tokens.

### 5.7 Section dividers

The Full gradient may appear as a 2px horizontal bar beneath section headings, but only on hero or cover surfaces, and not more than once per surface.

---

## 6 · Iconography and imagery

### 6.1 Icons

Use outline icons only — 1.5px stroke, rounded line caps, drawn on a 24×24 grid. Recommended sets: Tabler Outline, Phosphor Regular. Filled or duotone variants are not used.

### 6.2 Illustration

The studio's illustration style is set by the JP avatar — friendly cartoon-realism with a layer of system motifs (circuit board, code, security iconography) that visually echoes the technical work. New illustrations should:

- Use the brand palette as the dominant color
- Carry a single light source from the upper left
- Avoid drop shadows that exceed `--shadow-elevated`
- Include a subtle technical-pattern element where appropriate (grid, schematic, monospace label)

### 6.3 Photography

Photography is used sparingly. When used:

- Black-and-white or desaturated color
- Documentary tone (the Swing Dance hero on the Personal Life page is the reference)
- No stock business photography ever — handshakes, glass office buildings, generic smiling people

### 6.4 Emoji

Notion-native emoji are permitted in the body of writing and as a leading character in headings (one emoji per heading, never inline). The brand does not use custom emoji or platform-specific variants.

### 6.5 Things to avoid

- Heavy 3D illustration
- Stock business photography
- Rainbow or neon gradients beyond the brand palette
- Glassmorphism, brutalism, or any current visual trend that conflicts with the calm system tone
- Emoji used for emphasis ("✨ Important ✨")

---

## 7 · Application examples

### 7.1 Business card

Front: filled-icon mark in the upper left, name in Geist 500 16px, role in Geist 400 12px `--text-secondary`, URL in Geist Mono 10px `--text-tertiary` at the bottom. All on `--bg-page` light.

Back: Full gradient bleed, no text. The card carries the brand even when handed face-down.

### 7.2 Slide cover (dark)

Background `#0B0B0E` (slightly deeper than `--bg-page` dark for slide projection). Small combined lockup (32px icon) in the upper left. Eyebrow text in Geist Mono 11px `--text-tertiary` ("Q2 2026"). Headline in Geist 500 32–40px. The gradient never fills the entire slide background — at most a 2px accent bar beneath the lockup.

### 7.3 OG image (1200 × 630)

Background `--bg-page` light. Filled-icon mark at 96px in the upper left. Headline in Geist 500 56px, max 480px line length, `--text-primary`. One sentence of `body` 18px in `--text-secondary` below. Full gradient appears once as a 4px accent bar above the headline. No photography in OG images — they should be type-led.

### 7.4 Email signature

Plain text or single-table HTML signature. Filled-icon mark at 44px (PNG export of the SVG). Name in Geist 500 14px, two lines of contact info in Geist 400 12px `--text-secondary`. The "STUDIO" tag in Geist Mono 10px `--text-tertiary` `letter-spacing: 0.12em` at the bottom.

### 7.5 Favicon and app icon

Always use the filled-icon variant. Generate from a single 1024 × 1024 source SVG. Apple touch icon, Android adaptive icon, and favicon all share the same shape — only the corner radius adapts to the platform's masking.

### 7.6 Social avatar

The filled-icon mark fills the entire avatar square. Do not place the mark on a colored background; the gradient is the background. On platforms that crop to a circle, the radius is naturally generous enough that the mark remains centered and legible.

---

## 8 · Versioning and ownership

This document is owned by Jack H. Park and lives in the project repository. Changes are made by pull request and reviewed by the owner.

When the system changes, the version number above is incremented, the date is updated, and the change is described in a brief changelog appended below.

### Changelog

- **v1.0** (2026-05-27) — Initial release. Locked logo construction, Full and Mini gradients, Geist type system, Notion-ink neutrals, application examples.

---

*End of guidelines.*
