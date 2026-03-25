# Skills Execution Layer

This directory contains the executable skill entrypoints used for routing and task execution inside this repository.

## Layer Model

The repository now uses three layers:

- **Shared docs** in `shared-docs/skills/`
  - reusable methods
  - reusable checklists
  - reusable failure taxonomies
  - reusable output/report formats
- **Local adapters** in `docs/`
  - repo-specific vocabulary
  - repo-specific entrypoints
  - repo-specific invariants
  - repo-specific commands, signals, traces, or primitive mappings
- **Skill entrypoints** in `ai/skills/`
  - routing surface
  - execution summary
  - decision-oriented output contract
  - references to the shared doc and local adapter

## What `ai/skills` Is For

Each `SKILL.md` should do three jobs:

- help Codex choose the right skill
- state the narrow execution goal
- point execution at the right shared method and local adapter

`ai/skills` is not the place for full methodology docs or full repo-specific reference docs.

## What Should Stay in `SKILL.md`

- strong trigger wording
- explicit use-this / do-not-use-this boundaries
- minimal execution framing
- minimal workflow summary
- required output format
- references to:
  - the shared doc
  - the local adapter

## What Should Move to Shared Docs

- reusable review methods
- reusable audit ordering
- reusable checklists
- reusable failure classes
- reusable output/reporting patterns

If another repo could use the method unchanged with only a local mapping layer, it belongs in `shared-docs/skills/`.

## What Should Stay in Local Adapters

- local vocabulary
- local commands and entrypoints
- local traces, events, headers, flags, or UI primitive names
- local invariants and exclusions
- local page maps, ownership maps, and implementation references

If the detail depends on this repo’s exact terminology or implementation shape, it belongs in the adapter.

## How to Add or Migrate a Skill

1. Identify one repeated engineering job.
2. Split the source material into:
   - shared core
   - local adapter
   - do not promote
3. Draft the shared reusable doc.
4. Draft the thin local adapter.
5. Update or create `ai/skills/<skill>/SKILL.md` as the execution-layer entrypoint.
6. Keep the skill concise and reference-aware.

## Duplication Rule

Do not copy full shared methods into `SKILL.md`.

Do not copy full local mappings into `SKILL.md`.

The expected shape is:

- shared doc = reusable method
- local adapter = repo mapping
- `SKILL.md` = routing + execution entrypoint

If a skill starts reading like a full documentation file, it is too heavy.
If a skill becomes only a stub with no routing or output contract, it is too thin.
