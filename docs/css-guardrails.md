# CSS Guardrails

This repository enforces lightweight CSS guardrails to keep `styles/ai-design-system.css` strictly **primitive-only** (tokens, utilities, and reusable UI primitives) and to prevent fragmentation, feature leakage, and new color literals from entering component rules.

## Rules

1. **Feature keywords** (`admin`, `diagnostics`, `meta-card`, `documents`, `page-social`, `history-preview`, `preset-effects`, `allowlist`) are forbidden **only** in `styles/ai-design-system.css`. These selectors must live in feature-scoped stylesheets and be imported by their owning components.
2. **Color literals** (`#fff`, `rgba(...)`, `rgb(...)`, `hsl(...)`, `hsla(...)`) are prohibited in **component rules**.
   - **Allowed:** token definition blocks in `styles/ai-design-system.css` (e.g., shadows, tooltip backdrops), and token-driven functions such as `color-mix(...)` or `transparent`.
   - **Disallowed:** introducing literals directly in primitives or feature CSS.
3. **Role-token consumption** is enforced in `styles/ai-design-system.css`.
   - **Disallowed outside the token block:** legacy/raw tokens such as `--ai-bg*`, `--ai-fg*`, `--ai-border*`, `--ai-surface*`, or `hsl(var(--ai-*)))`.
   - **Allowed:** `--ai-role-*`, `--ai-text*`, `--ai-accent*`, `--ai-accent-contrast`, and `--ai-shadow*`.

## Design Principles (Why these rules exist)

- **Single source of truth:** All color and interaction semantics live in tokens and shared primitives, not in per-component overrides.
- **No feature leakage:** The design system must not grow into a feature UI kit; feature styling belongs with the feature.
- **Dark mode safety:** Literal colors in component rules are the fastest way to break dark mode and theme consistency.
- **Low cognitive load:** When modifying UI behavior, engineers should only need to touch tokens or a small set of primitives.

## How to run locally

```bash
pnpm lint:css-guardrails
```

This script (`scripts/check-css-guardrails.mjs`) is also called automatically by `pnpm lint`.

## Adding a new feature CSS file

If you relocate selectors out of `ai-design-system.css`, add the new stylesheet path to `featureCssFiles` inside `scripts/check-css-guardrails.mjs` and import that stylesheet in the owning component. Feature CSS files are checked for **color literals and legacy token usage**, but are allowed to contain feature-specific keywords.

## Sample failure output

```
styles/ai-design-system.css:212 [feature-keyword] .admin-doc-preview-teaser { ... }
styles/ai-design-system.css:345 [raw-token] border-color: var(--ai-border-muted);
styles/admin-doc-preview.css:10 [color-literal] border: 1px solid #fff;
```

Each failure prints the file, line number, rule name, and offending line. Fixing or relocating the reported line removes the guardrail violation.
