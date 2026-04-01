# Documentation Portal

This documentation tree works best when you treat documents by **role**, not just by folder. The repository has three distinct documentation classes:

1. **Canonical contracts**: the authoritative definitions and invariants.
2. **Operational/default guides**: the docs you should usually use while building, debugging, or reviewing.
3. **Historical/reference context**: audits, plans, postmortems, and background writeups that provide rationale, not default execution steps.

The `terminology.md` file remains the single authoritative source for shared terms. Supporting docs must derive from those terms and from the canonical contracts.

## Read First

1. `00-start-here/terminology.md`
2. Canonical contracts:
   - `canonical/rag/rag-system.md`
   - `canonical/guardrails/guardrail-system.md`
   - `canonical/telemetry/alerting-contract.md`
   - `canonical/design-system/ai-design-system.md`

## Use By Default

- `operations/` for reusable operational procedures and runbooks
- `telemetry/README.md` for telemetry navigation by contract vs operations vs historical context
- `chat/` for current UX and preset behavior
- `ui/README.md` for UI policy vs one-off audit navigation
- `testing/` when the task is explicitly about smoke or experiment verification

## Historical / Reference Context

- `analysis/` for implementation assessments and policy audits
- `ui-audits/` for one-off or phase-specific UI investigations
- `incidents/` for postmortems and prior failure context
- `implementation/plans/` for historical hardening plans and executable initiatives
- `debug/` for targeted investigations tied to specific failures or migrations

## Directory Overview

| Folder            | Purpose                                                                                                          | Default role                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `00-start-here/`  | Canonical terminology and shared meanings                                                                        | Canonical                                 |
| `canonical/`      | Stable contracts and invariants                                                                                  | Canonical                                 |
| `architecture/`   | Runtime/system realization of canonical contracts                                                                | Supporting reference                      |
| `chat/`           | Current UX and preset behavior grounded in canonical guardrails                                                  | Operational/default                       |
| `analysis/`       | Audits and implementation assessments                                                                            | Historical/reference unless task-specific |
| `implementation/` | Historic migrations and executable plans                                                                         | Historical/reference unless task-specific |
| `operations/`     | Reusable procedures, runbooks, and checklists                                                                    | Operational/default                       |
| `telemetry/`      | Telemetry navigation, operations, dashboards, and implementation guidance                                        | Mixed; start with `telemetry/README.md`   |
| `database/`       | Data model and schema documentation                                                                              | Supporting reference                      |
| `incidents/`      | Postmortems and corrective actions                                                                               | Historical/reference                      |
| `principles/`     | High-level engineering principles                                                                                | Canonical/supporting                      |
| `debug/`          | Targeted investigations for specific failures                                                                    | Historical/reference unless task-specific |
| `testing/`        | Smoke and experiment verification docs                                                                           | Operational/default when testing          |
| `ui/`             | Current UI policy and active audit guidance                                                                      | Operational/default                       |
| `ui-audits/`      | One-off or phase-specific UI investigations                                                                      | Historical/reference unless task-specific |
| `product/`        | Product-level interpretation of telemetry signals                                                                | Historical/reference unless task-specific |
| `pr/`             | PR template and process documentation                                                                            | Supporting reference                      |

## Navigation Rules

- Start with canonical docs when you need definitions, invariants, or policy.
- Start with operational docs when you need to execute a procedure or audit.
- Use historical/reference docs only when:
  - the task is explicitly about that artifact, or
  - the canonical/operational docs do not explain the current issue.
- Do not treat audits, postmortems, plans, or experiments as default reading for routine skill execution.

## Default Reading Paths

- **Telemetry work**
  - Start: `canonical/telemetry/alerting-contract.md`
  - Then: `telemetry/README.md`
- **Advanced settings / guardrails**
  - Start: `canonical/guardrails/guardrail-system.md`
  - Then: `chat/advanced-settings-ux.md`
- **RAG retrieval behavior**
  - Start: `canonical/rag/rag-system.md`
  - Then: `architecture/rag/rag-retrieval-engine.md`
- **Admin UI depth and hierarchy**
  - Start: `ui/README.md`
  - Then: `ui/depth-system.md`

## Contribution Guidance

- Keep documents aligned with the canonical model: terminology and contracts first, supporting docs second.
- No document may redefine terminology outside of `00-start-here/terminology.md`.
- Supporting documents must explicitly link to their governing canonical contract to maintain traceability and clarity.
- When changes span multiple areas, link between folders rather than duplicating content.
- Before editing telemetry or other contract-driven docs, confirm the contract in the canonical files to ensure consistency.
- Add new entries to this portal when adding folders, and update the overview table accordingly so readers always know where to look.
- If a document is primarily a one-off audit, postmortem, plan, or experiment, label it as historical/reference context and avoid presenting it as a default operational input.

## Promotion Candidates For Shared Extraction

The repo now stages generic skill cores separately from repo adapters.

- Canonical playbooks live in the sibling `jackhpark-ai-skills/playbooks/` repo path
- Canonical skills live in the sibling `jackhpark-ai-skills/skills/` repo path
- Repo-specific adapters remain under `docs/...-local-adapter.md`
- Repo-local skill bindings remain under `ai/skill-wrappers/`

Promote only material that is reusable across codebases. Keep repo names, file paths, event names, local trace names, primitive names, and canonical local contracts in this repository.

Stay concise, keep cross-links explicit, and avoid mixing implementation details into principle or operations-level narratives.
