# Root cause: Manual Ingestion Update Behavior panel padding

## Evidence
1. `rg -n "\.ai-panel" -S .` (shows there is only one `.ai-panel` definition; no overrides):
```
./styles/ai-design-system.css:340:.ai-panel {
```
2. `sed -n '320,340p' styles/ai-design-system.css` (reveals `.ai-panel` only sets background/border/radius; no padding):
```
.ai-panel {
  background-color: var(--ai-panel-surface, var(--ai-role-surface-1));
  border: 1px solid var(--ai-role-border-subtle);
  border-radius: var(--ai-radius-md);
}
```
Because there is no `padding` declaration, the computed padding for any `.ai-panel` is `0px` (the browser default).

3. Tailwind utilities such as `py-6` did not change the panel spacing because `.ai-panel` lacks any padding of its own and the utilities were applied via className but never won in the cascade—adding a new CSS module rule targeting the same DOM node is the only reliable way to win (see recommendation below).

## Recommendation
Add a CSS-module override on the `<div className="ai-panel px-6" aria-label="Manual ingestion controls">` wrapper that sets token-based `padding-block` (e.g., `var(--ai-space-6)`), ensuring both top and bottom breathing room without adding new markers or chrome. This keeps the spacing tokenized and scoped just to the manual controls panel.
