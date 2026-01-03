# Documentation Portal

The `docs/` tree is organized as a lifecycle portal rather than a flat list of markdown files. Each top-level folder represents how knowledge matures in this product: principles capture the guiding mindset, architecture describes the system design, implementation houses plans and migrations, testing verifies behaviors, operations codifies runbooks, incidents narrate postmortems, database describes persistence, and the design system defines the UI/UX primitives. Telemetry lives alongside these stages as a contract that ties observability to every other discipline, so treat that folder as an authoritative reference before making guardrail changes. See the Telemetry portal → [docs/telemetry/README.md](./telemetry/README.md).

## Directory Overview

| Folder            | Purpose                                                             | Primary Audience                          |
| ----------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| `principles/`     | Conceptual guardrails and high-level expectations for every change  | Engineers across disciplines              |
| `architecture/`   | System-wide designs, lifecycles, and invariants                     | Platform & backend architects             |
| `implementation/` | Executable plans (`plans/`) and historic migrations (`migrations/`) | Teams executing longer initiatives        |
| `testing/`        | Manual and automated test plans                                     | QA and SRE partners                       |
| `operations/`     | Operational checklists and runbooks                                 | SRE, support, incident responders         |
| `incidents/`      | Postmortems and corrective actions                                  | Incident responders, leadership learnings |
| `database/`       | Schema and data-layer documentation                                 | Data platform & backend engineers         |
| `design-system/`  | UI/token standards and component guidance                           | Front-end and design partners             |
| `telemetry/`      | Observability contracts, alert semantics, dashboards, and audits    | Telemetry/observability engineers         |

## How to Start

- **New contributors:** Begin in `principles/` to absorb the expectations for clarity, safety, and consistency, then read the architecture primer most relevant to the area you touch. Use the directory overview above to choose the lifecycle stage of your work.
- **Feature authors:** After aligning on principles, move into the relevant `architecture/` doc to understand invariants, then consult `implementation/plans/` for ongoing efforts you can align with. Update `testing/` and `operations/` docs in parallel so QA and runbooks stay coherent.
- **Operators and SREs:** Start with `operations/` checklists to understand runbook requirements, then read through `telemetry/` to reconcile observability expectations with the systems you operate. Refer to `incidents/` when hunting regressions and use `database/` for schema context.

## Telemetry Deep-Dive Reading Order

1. `telemetry/README.md` – overview of telemetry goals and the contract between services and observability.
2. `telemetry/langfuse-guide.md` – step-by-step guidance on Langfuse hooks, spans, and telemetry hygiene.
3. `telemetry/audit.md` – audit checklist that keeps telemetry semantics stable during refactors.
4. Additional telemetry docs (e.g., guardrail adjustments) as referenced within those files; treat them as extensions of the contract rather than independent guidance.

## Contribution Guidance

- Keep documents lifecycle-oriented: prefer moving or adding new files under the stage they impact instead of appending unrelated notes to an existing doc.
- When a change spans multiple stages (e.g., a migration that also affects telemetry), link between folders rather than duplicating content.
- Before editing telemetry docs, confirm the contract in `telemetry/README.md` so guardrails remain consistent.
- Add new entries to this portal when you add folders, and update the overview table accordingly so readers always know where to look.

Stay concise, keep cross-links explicit, and avoid mixing implementation details into principle or operations-level narratives.
