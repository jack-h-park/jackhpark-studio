# Skill Wrappers

This directory contains the project-local wrapper layer for reusable AI skills.

## Layer Model

The repository now uses three layers:

- **Canonical playbooks** in `jackhpark-ai-skills/playbooks/`
  - reusable methods
  - reusable checklists
  - reusable failure taxonomies
  - reusable output/report formats
- **Canonical skills** in `jackhpark-ai-skills/skills/`
  - reusable trigger baselines
  - reusable workflow skeletons
  - reusable output contracts
- **Local adapters** in `docs/`
  - repo-specific vocabulary
  - repo-specific entrypoints
  - repo-specific invariants
  - repo-specific commands, signals, traces, or primitive mappings
- **Project wrappers** in `ai/skill-wrappers/`
  - routing surface for this repo
  - canonical skill reference
  - local adapter binding
  - narrow project-specific overrides only

## What `ai/skill-wrappers` Is For

Each `SKILL.md` should do four jobs:

- help Codex choose the right skill
- point execution at the canonical shared skill
- point execution at the right local adapter
- state any repo-specific override that cannot live in the shared layer

`ai/skill-wrappers` is not the place for full methodology docs or full repo-specific reference docs.

## What Should Stay in A Wrapper

- strong trigger wording
- canonical skill reference
- local adapter reference
- minimal local execution framing
- only the smallest project-specific override set

## What Belongs In Canonical Skills

- reusable trigger baselines
- reusable review workflows
- reusable output/reporting contracts
- reusable pitfalls and routing boundaries

If another repo could reuse the skill entrypoint with only a local adapter change, it belongs in `jackhpark-ai-skills/skills/`.

## What Should Stay in Local Adapters

- local vocabulary
- local commands and entrypoints
- local traces, events, headers, flags, or UI primitive names
- local invariants and exclusions
- local page maps, ownership maps, and implementation references

If the detail depends on this repo's exact terminology or implementation shape, it belongs in the adapter.

## How to Add or Migrate a Skill

1. Identify one repeated engineering job.
2. Split the source material into:
   - canonical playbook
   - canonical skill
   - local adapter
   - do not promote
3. Draft or update the canonical playbook in `jackhpark-ai-skills/playbooks/`.
4. Draft or update the canonical skill in `jackhpark-ai-skills/skills/`.
5. Update or create `ai/skill-wrappers/<skill>/SKILL.md` as the local binding layer.
6. Keep the wrapper concise and reference-aware.

## Duplication Rule

Do not copy full canonical workflows into a wrapper.

Do not copy full local mappings into a wrapper.

The expected shape is:

- canonical playbook = reusable method
- canonical skill = reusable execution contract
- local adapter = repo mapping
- wrapper = routing + local binding

If a wrapper starts reading like a full documentation file, it is too heavy.
If a wrapper stops identifying the correct canonical skill or local adapter, it is too thin.
