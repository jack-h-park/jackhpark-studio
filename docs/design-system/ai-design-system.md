# AI Design System Guidelines

This document outlines the architecture and principles of the AI Design System, maintaining a clean separation between the **Style Layer** (CSS) and the **Component Layer** (React), while leveraging **Tailwind CSS** for layout and utility-first styling.

---

## 1. Guiding Principles (The "Why")

- **Minimalist Hierarchy**: Use typography and subtle borders instead of heavy fills to create separation.
- **Elevation & Physicality**: Components should feel tangible but light. Use `ai-shadow-soft` for subtle depth.
- **Clarity over Deco**: Visual elements (icons, badges) should always serve a functional purpose, such as indicating status or provider type.
- **Adaptive Resilience**: Design must work seamlessly in both light and dark modes via theme tokens.

---

## 2. Technical Infrastructure

### A. Tailwind CSS Integration

The design system is bridged to Tailwind via `tailwind.config.cjs`. This allows using design tokens directly as utility classes:

- **Colors**: `bg-ai-bg`, `text-ai-fg`, `border-ai-border`, `bg-ai-accent`.
- **Radii**: `rounded-ai`, `rounded-ai-sm`.
- **Shadows**: `shadow-ai-soft`.

### B. The `cn` Utility

Always use the `cn` helper (from `@/lib/utils`) for merging class names. It uses `tailwind-merge` to resolve conflicts intelligently.

```tsx
import { cn } from "@/lib/utils";
<div className={cn("p-4 border-ai-border", className)} />;
```

---

## 3. The Style Layer (Global CSS & Tokens)

The foundational styles are defined in `styles/ai-design-system.css`.

### A. Design Tokens

Always use tokens instead of hardcoded values.
| Type | Example Tokens | Tailwind Equivalent |
| :--- | :--- | :--- |
| **Color** | `var(--ai-bg)`, `var(--ai-fg)` | `bg-ai-bg`, `text-ai-fg` |
| **Radius** | `var(--ai-radius-md)` | `rounded-ai` |
| **Shadow** | `var(--ai-shadow-soft)` | `shadow-ai-soft` |

### B. Global CSS Primitives

- **Typography**: `.ai-label-overline` (metadata), `.ai-helper-text` (desc), `.ai-text-muted`.
- **Interactivity**: `.focus-ring`, `.ai-selectable--active`.

---

### C. Interaction Management

- **InteractionScope**: A context-aware wrapper used to propagate UI states (disabled, loading, readOnly) down the component tree automatically.
  - `disabled`: Prevents all interaction and applies "greyed out" styling.
  - `loading`: Primarily for buttons; shows a spinner and prevents clicks. Also disables nested inputs.
  - `readOnly`: For inputs; prevents modification but maintains higher visibility/contrast than `disabled`.

---

## 4. UI Primitives & Patterns (React Layer)

### A.- **Atomic Primitives** (`components/ui/`):

- `Button`, `Input`, `Select`, `Switch`, `Checkbox`: Core interactive elements that consume `InteractionScope`.
- `Tooltip`: Accessible tooltip implementation using `@radix-ui/react-tooltip`.
- `Card`, `Section`, `HeadingWithIcon`: Structural building blocks.

### B. Higher-Order Patterns

- **[card.tsx](file:///Users/jackpark/Local%20Code%20Repositories/nextjs-react-notion-x/components/ui/card.tsx)**: Structural cards using `.ai-card`.
- **[meta-card.tsx](file:///Users/jackpark/Local%20Code%20Repositories/nextjs-react-notion-x/components/ui/meta-card.tsx)**: **[NEW]** Diagnostic display for telemetry and guardrail data.
- **[field.tsx](file:///Users/jackpark/Local%20Code%20Repositories/nextjs-react-notion-x/components/ui/field.tsx)**: Combines Label + Control + Helper text.

---

## 5. Naming & Engineering Conventions

### File Naming

| Target                  | Naming           | Example                |
| :---------------------- | :--------------- | :--------------------- |
| **Atomic UI Component** | `kebab-case.tsx` | `button.tsx`           |
| **Feature Component**   | `PascalCase.tsx` | `ChatMessageItem.tsx`  |
| **Global Styles**       | `kebab-case.css` | `ai-design-system.css` |

### Grounding Rules for Implementation

1.  **Utility-first for layout, tokens for visuals.** Only use `@apply` for complex component-specific logic.
2.  **No hardcoded colors.** Use tokens (`hsl(var(--ai-...))`) or `color-mix` for transparency.
3.  **Interaction over props.** Prefer `InteractionScope` for managing groups of disabled/loading/readOnly states.
4.  **Accessibility is first-class.** Always use descriptive labels and prefer the React `Tooltip` component (Radix UI) over manual `data-tooltip` implementations.
