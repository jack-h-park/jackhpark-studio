# Skill Source Architecture

This document defines how the shared skill-source architecture is applied in this repository.

The canonical governance document lives in `jackhpark-ai-skills/docs/skill-source-architecture.md`. This file is the repo-local supplement for `nextjs-react-notion-x`: it records the local wrapper path, adapter path, and validation assumptions that make the shared architecture executable here.

## Governing Assumptions

These assumptions are intentional and should be treated as structural invariants unless this document and `scripts/check-ai-docs.mjs` are updated together.

- `jackhpark-ai-skills/playbooks/` is the source of truth for reusable documentation assets.
- `jackhpark-ai-skills/skills/` is the source of truth for reusable skill assets.
- Consumer repositories do not expose shared playbooks through a separate local folder.
- This repository's local AI execution layers are `ai/skill-wrappers/` and `docs/...-local-adapter.md`.
- Local copied source directories are recovery artifacts only. They are not canonical sources and should be removed after their useful content has been promoted or rebound through the canonical layers.
- Local adapters are required. They connect shared canonical assets to this repository's execution context and must not be removed unless the corresponding wrapper and canonical references are also redesigned.

## Local Binding Model

This repository consumes shared skills through local bindings. It does not copy or expose shared playbooks as repo-local source material.

### `ai/skill-wrappers/`

Project wrappers expose canonical skills inside this repository.

A wrapper is an execution binding layer, not a source-of-truth documentation layer. Each wrapper should contain only:

- canonical skill reference
- local adapter reference
- project-specific routing language
- narrow project-specific overrides
- project-specific exclusions, when needed

Wrappers should stay concise. Full reusable methods belong in canonical playbooks or canonical skills. Full repo-specific mappings belong in local adapters.

### `docs/...-local-adapter.md`

Local adapters map canonical skills and playbooks onto this repository.

A local adapter may contain:

- local vocabulary
- exact local commands
- local endpoints
- local trace names
- local selectors
- local UI primitive names
- local invariants and exclusions
- local ownership maps
- local source documents
- canonical playbook and skill identifiers for traceability

A local adapter must not become a reusable methodology document. If another repository could use the content without local substitutions, promote it to the shared repository instead.

## Exposure Rules

This repository does not maintain a separate repo-local playbook exposure layer.

Shared playbooks are consumed indirectly through:

1. a canonical skill in `jackhpark-ai-skills/skills/`
2. a project wrapper in `ai/skill-wrappers/`
3. a repo-specific local adapter in `docs/...-local-adapter.md`

Do not copy canonical playbooks or canonical skills into this repository as local source material. Temporary copied source directories should be treated as recovery artifacts only and removed after their useful content has been promoted or rebound through the canonical layers.

## Local File Contracts

The canonical file contracts are defined in `jackhpark-ai-skills/docs/skill-source-architecture.md`. This repository adds the following local contracts.

### Project Wrapper

```text
ai/skill-wrappers/<skill>/SKILL.md
```

Role:

Canonical skill and local adapter binding.

Required content:

- canonical skill reference
- local adapter reference
- project-specific routing language
- project-specific overrides, if needed
- project-specific exclusions, if needed

The wrapper must not duplicate the canonical workflow or the full local mapping.

### Local Adapter

```text
docs/<domain>/<skill>-local-adapter.md
```

Role:

Repo-specific mapping only.

Required content:

- canonical playbook reference
- canonical skill reference
- local vocabulary
- local commands, endpoints, traces, selectors, or primitive names
- local invariants and exclusions
- local source docs

The local adapter must not redefine the reusable method owned by the canonical playbook.

## Validation

`scripts/check-ai-docs.mjs` enforces this repository's local binding assumptions:

- wrapper files under `ai/skill-wrappers/` must include a `Canonical skill:` binding
- wrapper files under `ai/skill-wrappers/` must include a `Local adapter:` binding
- local adapters under `docs/` must reference both `jackhpark-ai-skills/playbooks/` and `jackhpark-ai-skills/skills/`
- referenced canonical assets must exist in the sibling shared skill repository
- forbidden legacy local source folders and obsolete document references must not reappear
