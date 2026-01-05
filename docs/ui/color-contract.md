# UI Color Contract

This page captures the **surface**, **border**, **divider**, and **interaction** roles that every component should share. The tokens below are sourced from `styles/ai-design-system.css` (see the token block at lines 8‑78) and right now represent the single color source of truth for both light and dark palettes.

## Surface Roles
- **Base surface**: `--ai-surface` / `bg-ai` is the default card/panel fill, `--ai-bg` is the layout background anchor.
- **Subtle surfaces**: `--ai-surface-muted`, `--ai-surface-tint`, and `--ai-bg-muted` provide layered depth without switching palettes.
- **DO**
  - Use `bg-[color:var(--ai-surface)]`, `bg-ai`, or `bg-[color-mix(in srgb,var(--ai-bg),var(--ai-border),<ratio>)]` for cards and dropdowns.
  - Layer hover/press states by blending `var(--ai-surface)` with `var(--ai-accent)` or `var(--ai-border)` using `color-mix`.
  - Prefer token-driven classes (`bg-ai-muted`, `bg-[var(--ai-bg-muted)]`) over repeating literal HSL/hex values.
- **DON’T**
  - Hardcode opaque hex strings (`#fff`, `#1f2027`, etc.) for UI surfaces.
  - Create once-off surface fills inside components; reuse the surface tokens instead of inventing new ones.

## Border Roles
- **Base and accent borders**: `--ai-border` is the default stroke, with `--ai-border-soft`, `--ai-border-muted`, and `--ai-border-strong` spacing the visual hierarchy.
- **DO**
  - Apply `border-[color:var(--ai-border)]`, `border-ai`, `border-[color-mix(in srgb,var(--ai-border) 70%, transparent)]`, etc.
  - For focus/hover outlines, use `focus-visible:ring-[color:var(--ai-ring)]` and keep `border` widths consistent with the Tailwind tokens.
  - Favor subtle divider strokes (`--ai-divider`) for lists and sheet separators.
- **DON’T**
  - Mix custom border colors per component; we want one portable set so global themes can shift.
  - Drop in brand-specific colors (e.g., `border-color: #ff0000`) inside reusable primitives.

## Divider Roles
- **Separator token**: `--ai-divider` ensures vertical and horizontal separators maintain weight and opacity without clashing with backgrounds.
- **DO**
  - Use `border-[color:var(--ai-divider)]` or `bg-[color:var(--ai-divider)]` for thin splits inside panels.
  - Reserve `--ai-divider` for structural splits, not status badges.
- **DON’T**
  - Add custom `rgba`/`hsl` values for separators; they disrupt the intended contrast ratios.

## Interaction Roles
- **Accent colors**: `--ai-accent`, `--ai-accent-strong`, `--ai-accent-soft`, `--ai-accent-bg` power links, primary buttons, and badges.
- **Status colors**: `--ai-success`, `--ai-warning`, `--ai-error` plus their `*-muted` variants drive success/error/warning states.
- **Focus/hover rings**: `--ai-ring` and `--ai-pill-*` tokens describe outlines and pill backgrounds.
- **DO**
  - Tie `hover:bg`, `active:bg`, `focus:ring`, and `text` variants to the tokens above (e.g., `hover:bg-[color-mix(in srgb,var(--ai-accent),var(--ai-bg),15%)]`).
  - Use semantic tokens like `bg-[var(--ai-error-muted)]` or `text-[var(--ai-success)]` for feedback messaging.
  - When necessary, use `color-mix` to adjust opacity while staying anchored to a base token.
- **DON’T**
  - Use standalone interaction colors (e.g., `hover:text-[#1d4ed8]`) that bypass theme tokens.
  - Re-implement accent shades per component; extend the existing tokens or add new ones to `styles/ai-design-system.css` before using them in UI code.
