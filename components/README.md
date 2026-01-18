# Component Placement Guidelines

1. **UI primitives** (buttons, segments, grids) live under `components/ui/` and use kebab-case filenames. They must be domain-agnostic and export named components (`Button`, `Tabs`, `SegmentedControl`, etc.).
2. **Domain UI** belongs in feature folders such as `components/ingestion/`. Names use PascalCase and may wrap primitives to compose richer patterns (`IngestionSourceToggle`).
3. **Page-level layouts** stay within their feature area (e.g., `components/admin/ingestion/ManualIngestionPanel.tsx`).
4. Avoid leaking domain-specific words into `components/ui`. If you need reusable helpers inside a domain, promote them under the domain folder or into an `ui/_internal` module if multiple domains share them.
5. When moving/renaming files, update all imports and barrel exports so `pnpm lint` and `pnpm lint:css-guardrails` keep passing.
