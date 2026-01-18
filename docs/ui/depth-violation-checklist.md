# Depth Violation Checklist (Ingestion Dashboard PRs)

Use this before merging any ingestion UI change to confirm depth/hierarchy rules.

- **Depth mapping**: Have you assigned each new section/card to L0–L3 and kept the heirarchy consistent with the depth system policy?
- **Container correctness**: Are you using the right surface primitive (`ai-card`, `ai-panel`, `inset-panel`, etc.) for the declared depth instead of stacking extra borders/shadows?
- **Seam ownership**: Does only one container/divider own each horizontal or vertical cut (no double `border-top`/`border` or duplicate `ai-panel` around the same block)?
- **Mode toggle vs tab**: If you added tabs, do they break workflows (L1) instead of toggling short-lived modes? Use inline toggles for mode changes that live within the same card.
- **Naming/placement**: Are new primitives placed under `components/ui` with kebab-case file names and CSS module pairs, while domain-aware wrappers stay under `components/<domain>`?
