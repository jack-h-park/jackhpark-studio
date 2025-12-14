# History Preview (Dual Preview)

```mermaid
graph TD
  subgraph Client["Client-side (Estimate & UI)"]
    A[Preset change]
    B[History token budget slider]
    C[Summary replacement toggle]
    D[Exact preview toggle (dev-only)]
  end

  A --> E[Update `sessionConfig`]
  B --> E
  C --> E
  D --> E
  E --> F[`useChatSession` with `messages[]`]
  F --> G[computeHistoryPreview → Estimate (client)]
  G --> H[HistoryPreview + Accordion list]
  G --> I[Diff detector compares Estimate vs Exact]
  I --> J[Diff telemetry store (dev-only)]
  J --> K[HistoryPreviewDiffPanel (copy/clear) (dev-only)]
  D --> K
  K --> I

  subgraph DevEndpoint["Dev-only Exact Preview path"]
    L[/api/internal/chat/history-preview/]
    M[Server guardrail + window logic]
    N[Return Exact (server) preview]
  end

  G --> L
  L --> M
  M --> N
  N --> I
  H --> |"shows counts + included list"| I
  I --> |"diff badge"| H

  M --> |"getChatGuardrailConfig, applyHistoryWindow"| O[Guardrail engine]
  O --> |"includes synthetic summary metadata"| N
```

## What this is

- Estimate (client) gives users fast, visible budget impact without blocking chat turns.
- Exact (server) mirrors production guardrail logic and surfaces deviations when dev-enabled.
- Diff telemetry (dev-only) tracks mismatches so engineers can tune token heuristics and guardrail summaries.

## Core components

- `ImpactBadge` annotates disruptive controls that trim history (`components/chat/settings/impact.ts`).
- `DrawerInlineWarning` injects contextual reminders when editing history-sensitive sliders.
- `HistoryPreview` + accordion render counts, “Show list,” and optional server comparison tiles (`components/chat/settings/HistoryPreview.tsx`).
- `historyWindowPreview.ts` houses `computeHistoryPreview`, the ~4‐chars/token estimator and index tracking helper.
- `history-preview.ts` is the gated `/api/internal/chat/history-preview` endpoint that reuses `getChatGuardrailConfig` + `applyHistoryWindow` to produce Exact (server) data and synthetic summary metadata.
- Diff telemetry store + panel (`lib/chat/historyPreviewDiffTelemetry.ts`, `HistoryPreviewDiffPanel.tsx`) keep in-memory events, copy/clear shortcuts, and badge indicators for dev investigations.

## Runtime flow

1. User adjusts Advanced Settings Drawer controls (preset, history token budget slider, summary toggle, dev-only Exact preview switch) which mutate `sessionConfig`.
2. `useChatSession` keeps `messages[]` live and passes them to `computeHistoryPreview`, producing an Estimate (client) count/index snapshot for the accordion.
3. When enabled in dev/preview builds, the client debounces/caches a POST to `/api/internal/chat/history-preview` to request Exact (server) output derived from guardrail history/window logic plus optional synthetic prompts.
4. Diff detector compares Estimate vs Exact counts/indices; if they differ it records a event in the diff telemetry store (`recordDiffEvent`) using the last user-set reason.
5. UI updates: header badges show diffs, accordion counts refresh, included list renders, and dev-only HistoryPreviewDiffPanel surfaces telemetry with JSON copy/clear buttons.

## Dev vs Prod behavior

- Prod: only uses Estimate (client); no `/api/internal/chat/history-preview` calls, no diff telemetry, and the Exact preview toggle is hidden.
- Dev / Preview builds: Exact preview toggle enables server compare; diff telemetry panel appears alongside the preview grid and logs every mismatch (counts, indices, context).

## Key decisions / tradeoffs

- Estimate uses the cheap ~4 chars/token rule so updates stay responsive even while typing or sliding budgets.
- Exact preview reuses guardrail helpers (`getChatGuardrailConfig`, `applyHistoryWindow`) so prod behavior is the ground truth.
- Debouncing + payload caching on the fetch prevents spamming the internal endpoint while adjusting sliders.
- No message content is logged beyond indices and truncated synthetic summaries, keeping sensitive text out of telemetry.
- Diff telemetry emits only in dev mode, avoiding policy resets or telemetry noise in production.
- LLM model/engine changes remain seamless because session history is preserved across config updates.

## Files & entry points

- `components/chat/settings/ChatAdvancedSettingsDrawer.tsx`
- `components/chat/settings/HistoryPreview.tsx`
- `components/chat/settings/HistoryPreviewDetails.tsx`
- `components/chat/settings/DrawerInlineWarning.tsx`
- `components/chat/settings/ImpactBadge.tsx`
- `lib/chat/historyWindowPreview.ts`
- `pages/api/internal/chat/history-preview.ts`
- `lib/chat/historyPreviewDiffTelemetry.ts`
- `components/chat/settings/HistoryPreviewDiffPanel.tsx`
- `components/chat/settings/impact.ts`
