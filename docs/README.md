# Documentation Portal

This documentation portal centers on a canonical approach to knowledge management. The `terminology.md` file serves as the single authoritative source for definitions and meanings. Canonical system and policy documents establish the invariants and contracts that govern the product. All supporting documents derive from and reference these canonical contracts to ensure consistency and clarity.

## Canonical Reading Order (Start Here)

1. `00-start-here/terminology.md`
2. Canonical system contracts:
   - `canonical/rag/rag-system.md`
   - `canonical/guardrails/guardrail-system.md`
   - `canonical/telemetry/alerting-contract.md`
   - `canonical/design-system/ai-design-system.md`
3. Supporting documentation by role and function:
   - Architecture briefs and system summaries
   - Chat experience documentation (`chat/`)
   - Analysis audits (`analysis/`)
   - Telemetry and operations guidance

## Directory Overview

| Folder            | Purpose                                                                                                         | Primary Audience                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `00-start-here/`  | Canonical terminology: single source of truth for all product definitions                                       | All contributors                          |
| `canonical/`      | Canonical contracts that define invariants and governing policies for every layer of the product                | Platform, backend, and policy architects  |
| `architecture/`   | Architecture summaries and implementation patterns that explain how canonical contracts are realized in the stack | Technical leads and systems architects    |
| `chat/`           | User experience, preset, and advanced settings guidance grounded in canonical guardrails                        | Product, UX and platform engineers        |
| `analysis/`       | Audits and assessments of how implementation (e.g., advanced settings, memory) obeys canonical constraints       | Architects and risk/ops reviewers         |
| `implementation/` | Supporting executable plans (`plans/`) and historic migrations (`migrations/`) derived from canonical contracts | Teams executing initiatives               |
| `operations/`     | Operational playbooks, runbooks, and checklists aligned with canonical contracts                                 | SREs, operators, and incident responders  |
| `telemetry/`      | Contract-driven observability semantics, dashboards, and implementation guidance                                | Telemetry and observability engineers     |
| `database/`       | Data model and schema documentation consistent with canonical definitions                                       | Data platform & backend engineers         |
| `incidents/`      | Postmortems and corrective actions that refer back to canonical contracts                                        | Incident responders, leadership learnings |
| `principles/`     | Guiding principles that frame interpretation of canonical contracts and trade-offs                              | Leadership and cross-functional partners  |
| `design-system/`  | Canonical UI/token standards and component guidance                                                             | Front-end and design partners             |

## How to Start

- **New contributors:** Begin with `00-start-here/terminology.md` to understand foundational meanings and definitions. This ensures clarity and alignment across all documentation and development efforts.
- **Feature authors:** Start with terminology, then read the canonical contracts before exploring supporting guides. Key content includes:
  - Chat navigation: `chat/chat-user-guide.md`, `chat/advanced-settings-ux.md`, `chat/session-presets.md`.
  - Analysis audits: `analysis/advanced-settings-ownership-audit.md` and `analysis/memory-implementation-analysis.md`.
- **Operators and SREs:** Begin with the telemetry contract to understand observability expectations, then move to operations documentation for runbook requirements, and refer to incidents for historical context and learning.

## Telemetry: Contract-First Navigation

- The primary source of truth for telemetry semantics and alerting is `canonical/telemetry/alerting-contract.md`.
- Consult the telemetry contract before reading supporting telemetry docs in `telemetry/`, such as dashboards, operations, runbooks, and implementation guidance (`telemetry/dashboards/`, `telemetry/operations/`, `telemetry/runbooks/`, `telemetry/implementation/`).
- Treat all telemetry documentation as extensions of the canonical contract rather than standalone guidance.

## Contribution Guidance

- Keep documents aligned with the canonical model: terminology and contracts first, supporting docs second.
- No document may redefine terminology outside of `00-start-here/terminology.md`.
- Supporting documents must explicitly link to their governing canonical contract to maintain traceability and clarity.
- When changes span multiple areas, link between folders rather than duplicating content.
- Before editing telemetry or other contract-driven docs, confirm the contract in the canonical files to ensure consistency.
- Add new entries to this portal when adding folders, and update the overview table accordingly so readers always know where to look.

Stay concise, keep cross-links explicit, and avoid mixing implementation details into principle or operations-level narratives.
