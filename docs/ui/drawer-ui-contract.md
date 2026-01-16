# Drawer UI Contract (Advanced Settings)

## Purpose
Drawer-style admin surfaces are high-density, token-driven experiences that sit on top of the base layout layer. In dark mode, the usual `--ai-role-border-subtle`/transparent backgrounds can make rows, tiles, and dividers disappear unless a drawer-scoped contract is enforced. This document codifies those localized affordances while keeping the global design system untouched.

## Allowed vs Forbidden

| Allowed (drawer scope only) | Forbidden |
| --- | --- |
| Idle-only `.ai-selectable:not(.ai-selectable--active):not(:hover):not(:focus-visible)` border boosts using `--ai-role-border-subtle` (dark mode may bump to `--ai-role-border-base`). | Adding literal colors/hard-coded tokens to drawer components. |
| Divider bars implemented via visible borders or 1px backgrounds with `--ai-role-divider-muted` (dark tweaks may use `--ai-role-border-base`). | Modifying `.ai-selectable--active/hover` styles or introducing new hover logic. |
| Row helpers (label + hint + control) that preserve spacing without adding new shadows or surfaces. | Touching `styles/ai-design-system.css` for drawer-specific fixes. |
| Hit-area helpers (close buttons, switches) that use existing tokens and radius variables. | Inventing new box shadows or backgrounds just for one drawer section. |

## Canonical Patterns

### Drawer Idle Visibility Pattern
```css
.drawerSelectableScope :global(.ai-selectable:not(.ai-selectable--active):not(:hover):not(:focus-visible)) {
  border: 1px solid var(--ai-role-border-subtle);
}

:global(.dark) .drawerSelectableScope :global(.ai-selectable:not(.ai-selectable--active):not(:hover):not(:focus-visible)) {
  border-color: var(--ai-role-border-base);
}
```

### Drawer Divider Pattern
```css
.drawerDivider {
  width: 100%;
  height: 0;
  border-top: 1px solid var(--ai-role-divider-muted);
  border-bottom: 0;
  background: transparent;
  flex: 0 0 auto;
}

:global(.dark) .drawerDivider {
  border-top-color: var(--ai-role-border-base);
}
```

### Drawer Row Pattern
```css
.drawerRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding-block: 0.5rem;
}
```

## How to Extend to Other Drawers

- **DO** implement these patterns inside the drawer’s local CSS module (e.g., `ChatAdvancedSettingsDrawer.module.css`).  
- **DON’T** add them to `styles/ai-design-system.css` or create new global tokens—drawer affordance adjustments must remain scoped.

## Reviewer Checklist

- Idle-only selector excludes `.ai-selectable--active`, `:hover`, and `:focus-visible`.  
- No edits touch `styles/ai-design-system.css` for drawer-specific fixes.  
- No new literal colors/hard-coded tokens in component or drawer modules.  
- Divider must render (computed style shows a solid border/background, not `border: 0` or transparent).  
- Drawer switches’ OFF state remains visible (border or track uses `--ai-role-border-*` tokens).  
- Reset/close CTAs use token-driven primitives (e.g., `Button variant="outline"`, `.drawerCloseButton` for hit area).  
- Document references and frame new drawer helpers so future contributors know where to look.
