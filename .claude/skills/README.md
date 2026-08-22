# Skills

Audit and review methods for this repository, one directory per method. Each `SKILL.md` is
self-contained: when it applies, the goals, the method, the workflow, the output format, and
a pointer to its repo-specific companion doc under `docs/`.

| Skill | Companion doc |
|---|---|
| `telemetry-contract-audit` | `docs/telemetry/telemetry-contract-audit-local-adapter.md` |
| `rag-trace-review` | `docs/telemetry/retrieval-trace-review-local-adapter.md` |
| `chat-api-smoke-regression` | `docs/testing/api-smoke-patterns-local-adapter.md` |
| `admin-surface-depth-audit` | `docs/ui/admin-surface-hierarchy-audit-local-adapter.md` |
| `advanced-settings-policy-audit` | `docs/chat/settings-ownership-audit-local-adapter.md` |

The split follows one rule: the skill holds the **method** and loads only when a request
matches its description; the companion doc holds the **local vocabulary** — exact field
names, vendor surfaces, invariants, control knobs — and is read from the skill.

## History

These were previously wrappers under an `ai/skill-wrappers` directory, binding to canonical playbooks
and skills in a sibling `jackhpark-ai-skills` repository through a four-layer contract
(canonical playbook → canonical skill → local adapter → local wrapper).

Two problems ended that arrangement. That directory is not a path Claude Code
discovers skills from, so despite good trigger descriptions none of them ever fired. And
every method in the shared library had exactly one consumer — this repo — so the
indirection bought no reuse while costing three extra files per topic.

## Adding a skill

Write it here, self-contained. Put repo-specific vocabulary in a companion doc under `docs/`
and link it from the skill. Only if a method turns out to be used by a second repo does
extracting it anywhere else become worth discussing.
