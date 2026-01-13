# Documentation Portal

This documentation portal centers on a canonical approach to knowledge management. The `terminology.md` file serves as the single authoritative source for definitions and meanings. Canonical system and policy documents establish the invariants and contracts that govern the product. All supporting documents derive from and reference these canonical contracts to ensure consistency and clarity.

## Canonical Reading Order (Start Here)

1. `00-start-here/terminology.md`
2. Canonical system contracts:
   - `architecture/rag-system.md`
   - `architecture/guardrail-system.md`
   - `architecture/alerting-contract.md`
   - `design-system/ai-design-system.md`
3. Supporting documentation by role and function:
   - Architecture
   - Chat
   - Telemetry
   - Operations

## Directory Overview

| Folder            | Purpose                                                                                                         | Primary Audience                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `00-start-here/`  | Canonical terminology: single source of truth for all product definitions                                       | All contributors                          |
| `architecture/`   | Canonical system contracts defining invariants and policies                                                     | Platform & backend architects             |
| `implementation/` | Supporting executable plans (`plans/`) and historic migrations (`migrations/`) derived from canonical contracts | Teams executing initiatives               |
| `testing/`        | Supporting test plans that validate contract adherence and behaviors                                            | QA and SRE partners                       |
| `operations/`     | Supporting operational checklists and runbooks aligned with canonical contracts                                 | SRE, support, incident responders         |
| `incidents/`      | Postmortems and corrective actions referencing canonical contracts                                              | Incident responders, leadership learnings |
| `database/`       | Supporting schema and data-layer documentation consistent with canonical definitions                            | Data platform & backend engineers         |
| `design-system/`  | Canonical UI/token standards and component guidance                                                             | Front-end and design partners             |
| `telemetry/`      | Contract-driven and cross-cutting observability contracts, alert semantics, dashboards, and audits              | Telemetry/observability engineers         |
| `product/`        | Supporting product interpretations of telemetry and operational signals                                         | PMs, product-aware engineers              |

## How to Start

- **New contributors:** Begin with `00-start-here/terminology.md` to understand the foundational meanings and definitions. This ensures clarity and alignment across all documentation and development efforts.
- **Feature authors:** Start with terminology, then study the relevant canonical system contracts to understand invariants and policies. Finally, consult supporting documentation such as architecture, telemetry, and operations to align your work with established contracts.
- **Operators and SREs:** Begin with the telemetry contract to understand observability expectations, then move to operations documentation for runbook requirements, and refer to incidents for historical context and learning.

## Telemetry: Contract-First Navigation

- The primary source of truth for telemetry semantics and alerting is `architecture/alerting-contract.md`.
- Follow this contract before consulting supporting telemetry docs such as `telemetry/langfuse-guide.md` and `telemetry/audit.md`.
- Treat all telemetry documentation as extensions of the canonical contract rather than standalone guidance.

## Contribution Guidance

- Keep documents aligned with the canonical model: terminology and contracts first, supporting docs second.
- No document may redefine terminology outside of `00-start-here/terminology.md`.
- Supporting documents must explicitly link to their governing canonical contract to maintain traceability and clarity.
- When changes span multiple areas, link between folders rather than duplicating content.
- Before editing telemetry or other contract-driven docs, confirm the contract in the canonical files to ensure consistency.
- Add new entries to this portal when adding folders, and update the overview table accordingly so readers always know where to look.

Stay concise, keep cross-links explicit, and avoid mixing implementation details into principle or operations-level narratives.
