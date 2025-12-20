# AI Design System Guidelines

This document outlines the architecture and principles of the AI Design System, maintaining a clean separation between the **Style Layer** (CSS) and the **Component Layer** (React).

---

## 1. Guiding Principles (The "Why")

- **Minimalist Hierarchy**: Use typography and subtle borders instead of heavy fills to create separation.
- **Elevation & Physicality**: Components should feel tangible but light. Use `ai-shadow-soft` for subtle depth.
- **Clarity over Deco**: Visual elements (icons, badges) should always serve a functional purpose, such as indicating status or provider type.
- **Adaptive Resilience**: Design must work seamlessly in both light and dark modes via theme tokens.

---

## 2. The Style Layer (Global CSS & Tokens)

The foundational styles are defined in `styles/ai-design-system.css`. This layer provides the "look and feel" through design tokens and utility classes.

### A. Design Tokens

Always use tokens instead of hardcoded values.
| Type | Example Tokens |
| :--- | :--- |
| **Color** | `var(--ai-bg)`, `var(--ai-fg)`, `var(--ai-accent)`, `var(--ai-border)` |
| **Radius** | `var(--ai-radius-sm)`, `var(--ai-radius-md)`, `var(--ai-radius-lg)` |
| **Shadow** | `var(--ai-shadow-soft)`, `var(--ai-shadow-elevated)` |

### B. Global CSS Selectors (Primitives)

Low-level classes that can be applied to any element:

- **Typography**: `.ai-label-overline` (uppercase metadata), `.ai-helper-text` (small desc), `.ai-text-muted`.
- **Interactivity**: `.focus-ring`, `.ai-selectable--active`, `.ai-selectable--hoverable`.
- **Special**: `.ai-info-icon` (hoverable tooltip triggers), `.ai-check-circle`.

---

## 3. UI Primitives (Atomic React Components)

Located in `components/ui/`, these components encapsulate global CSS primitives into reusable React building blocks.

- **[button.tsx](file:///Users/jackpark/Local%20Code%20Repositories/nextjs-react-notion-x/components/ui/button.tsx)**
  - Wraps `.ai-button` with variants: `default`, `outline`, `ghost`.
  - Automatically includes `.focus-ring`.
- **[input.tsx](file:///Users/jackpark/Local%20Code%20Repositories/nextjs-react-notion-x/components/ui/input.tsx)** / **[switch.tsx](file:///Users/jackpark/Local%20Code%20Repositories/nextjs-react-notion-x/components/ui/switch.tsx)**
  - Wraps `.ai-input`, `.ai-switch`.
  - Handles state via data-attributes like `[data-state="checked"]`.
- **[label.tsx](file:///Users/jackpark/Local%20Code%20Repositories/nextjs-react-notion-x/components/ui/label.tsx)**
  - Wraps typography primitives like `.ai-label-overline`.

---

## 4. Non-Primitive Components (Patterns & Features)

These are complex components that combine multiple primitives or define specific domain patterns.

### A. UI Layout Patterns (`components/ui/`)

- **[card.tsx](file:///Users/jackpark/Local%20Code%20Repositories/nextjs-react-notion-x/components/ui/card.tsx)**: Implements `.ai-card` structure with sub-components (`CardHeader`, `CardTitle`, `CardContent`).
- **[section.tsx](file:///Users/jackpark/Local%20Code%20Repositories/nextjs-react-notion-x/components/ui/section.tsx)**: Implements `.ai-setting-section`, frequently used in setting drawers/panels.
- **[field.tsx](file:///Users/jackpark/Local%20Code%20Repositories/nextjs-react-notion-x/components/ui/field.tsx)**: A high-level pattern that combines a `Label`, a `Control` (Input/Switch), and a `Description`.

### B. Feature-Specific Components (`components/chat/`, `components/admin/`)

- **[ChatMessageItem.tsx](file:///Users/jackpark/Local%20Code%20Repositories/nextjs-react-notion-x/components/chat/ChatMessageItem.tsx)**: Combines local CSS Modules for message bubble layout with global tokens and patterns (like `ai-info-icon`) for telemetry diagnostics.

---

## 5. Naming & Engineering Conventions

### File Naming

Follow these rules to keep the codebase navigable:

| Target                        | Naming                  | Example                       |
| :---------------------------- | :---------------------- | :---------------------------- |
| **Atomic UI Component**       | `kebab-case.tsx`        | `button.tsx`, `stat-card.tsx` |
| **Complex Feature Component** | `PascalCase.tsx`        | `ChatMessageItem.tsx`         |
| **Global Styles**             | `kebab-case.css`        | `ai-design-system.css`        |
| **Component Styles**          | `PascalCase.module.css` | `Tabs.module.css`             |
| **Custom Hooks**              | `use-kebab-case.ts`     | `use-chat-scroll.ts`          |

### Grounding Rules for Implementation

1. **Never Hardcode Colors**: Always use a CSS variable. If a shade is needed that doesn't exist, use `color-mix(in srgb, var(--ai-text) 10%, transparent)`.
2. **Prop Transparency**: Atomic components (`Button`, `Input`) should always spread `...props` to allow standard HTML attributes.
3. **Accessibility First**: Use `aria-describedby` in `Field` components (automatically handled by the `Field` pattern) to link labels and descriptions to inputs.
4. **Theme Continuity**: If a component looks wrong in dark mode, adjust the token values or use `color-mix` rather than hardcoding a "dark" specific hex code.
