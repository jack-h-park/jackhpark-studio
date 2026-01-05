# Color Audit

We scoped this audit to **ad-hoc background**, **border**, and **hover/active/focus** colors that bypass the `--ai-*` tokens defined in `styles/ai-design-system.css`. The goal is to have a single source of truth before refactoring any components.

## Major Offenders

- **`components/PageSocial.module.css` (lines 75‑135)**  
  Each social action hardcodes its brand color for the hover border and background (`#3b5998`, `#2795e9`, `#0077b5`, etc.). These selectors also define their own hover transitions, creating per-service palettes that the design system currently has no way to override.

- **`components/styles.module.css` (lines 20‑187)**  
  Several global hover states and text colors rely on explicit RGB/hex values (`rgb(55, 53, 47)`, `#2795e9`, `#c9510c`, `#e0265e`, `#19bf64`) for focus/hover/active states (e.g., `.toggleDarkMode:hover`, `.likeTweet:hover`, `.retweet:hover`). Because they do not reference tokens, these colors will drift when themes change.

- **`styles/notion.css` (lines 80‑200 & many repeated regions)**  
  Notion’s stylesheet (still included for static embeds) introduces dozens of `rgba()`/`#` definitions for borders, backgrounds, and interactive states across its selectors (e.g., `.notion-mermaid-source`, `.notion-mermaid-source pre`, etc.). These overrides use `!important` liberally and are fully decoupled from our token set.

- **`styles/prism-theme.css` (lines 3‑120)**  
  Syntax highlighting is defined with static colors (`rgba(249, 250, 251, 1)`, `#5b9b4c`, `#ff4081`, `rgba(59, 130, 246, 1)`, etc.) for both light and dark palettes. While it’s an external theme, these values leak into the UI via the static notion/Prism components and would need tokenization if we want consistent theming.

- **`components/chat/ChatMessagesPanel.module.css` (lines 17‑40)**  
  The anchor styles use `color: #1d4ed8` for links and `color: white` for user bubbles, while hover/focus states mix tokens (`hsl(var(--ai-fg))`). The inconsistent usage of token vs. hardcoded values creates split behavior for hover/focus transitions.

## Additional Observations

- **`pages/api/social-image.tsx` (lines 49‑136)**  
  The OG image generator applies `backgroundColor: "#1F2027"`, `backgroundColor: "#fff"`, and `border: "16px solid rgba(0,0,0,0.3)"`. Although this lives in the edge API rather than UI components, it is another place to standardize with the eventual color contract (if we ever need light/dark variants for social previews).

- **Areas still tokenized**  
  Many UI components already respect tokens (e.g., `components/ui/*`, `styles/ai-design-system.css`), but the files listed above represent the current “exceptions” that should be prioritized in Phase 2 (component refactors).
