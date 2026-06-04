# External Doc Alignment Review Skill Proposal

## Purpose

This document is a promotion-ready proposal for a shared canonical skill that reviews whether an external artifact accurately reflects a repository's documented system behavior.

It is stored here as a draft because the sibling `jackhpark-ai-skills` repository is not present in the current filesystem. The intended destination is the shared skills repository, not this repository.

## Recommended Deployment

- Canonical skill:
  - `jackhpark-ai-skills/skills/hybrid/external-doc-alignment-review/SKILL.md`
- Canonical playbook:
  - `jackhpark-ai-skills/playbooks/external-doc-alignment-review.md`

## Why This Should Be Shared

This method is not specific to `nextjs-react-notion-x`.

It applies whenever an agent needs to review whether an external document such as a Notion page, README, PRD, architecture note, portfolio writeup, design doc, or launch brief matches:

- the repository's canonical contracts
- the repository's current documented architecture
- important runtime semantics and guardrails
- meaningful observability and verification behavior

The reusable method is stable across repositories. Only the local source-of-truth docs, vocabulary, and implementation references should vary by repo.

## Proposed Canonical Skill Draft

Target path:
`jackhpark-ai-skills/skills/hybrid/external-doc-alignment-review/SKILL.md`

```md
---
name: external-doc-alignment-review
description: Use when reviewing whether an external artifact such as a Notion page, README, PRD, architecture note, portfolio writeup, or launch brief accurately reflects a repository's documented system behavior and constraints
---

# External Doc Alignment Review

## Overview

Review external documentation against a repository's source-of-truth docs before proposing edits.

The core principle is that the task is not only to find wrong statements. It is also to find missing constraints, over-broad claims, vague architecture language, and user-facing wording that drifts away from the repository's actual contracts.

## When to Use

Use this when:

- an external document claims to describe how a system works
- a portfolio or public-facing writeup needs to stay faithful to implementation
- a PRD, architecture page, or launch note may be overstating what the product does
- a user asks what should be updated in an external artifact after code or docs changed
- the review needs before/after edit proposals, not only high-level comments

Do not use this when:

- the task is a code-path root-cause investigation
- the task is a telemetry-contract audit without an external artifact to compare
- the task is pure copyediting without any repo-backed accuracy review

## Review Goals

Check whether the external artifact:

- matches the repository's canonical architecture
- preserves important runtime semantics and guardrails
- avoids overclaiming or implying behaviors the system does not guarantee
- includes critical constraints that materially affect interpretation
- describes observability and verification at the right level

## Core Failure Modes

Look for:

- **incorrect statements**
  - the external doc directly contradicts source-of-truth docs
- **missing system constraints**
  - the doc omits lifecycle, eligibility, budgeting, policy, quota, or safety limits that materially change the meaning
- **over-broad architecture language**
  - the doc makes a conditional behavior sound unconditional
- **capability vs force confusion**
  - the doc describes an optional or policy-governed behavior as always-on
- **selection-layer omission**
  - the doc explains retrieval or generation but omits the layer that filters what actually survives
- **observability flattening**
  - the doc says the system is observable but does not explain what can actually be diagnosed
- **verification gap**
  - the doc presents quality claims without explaining how behavior is checked

## Workflow

1. Identify the external artifact under review.
2. Identify the repository's source-of-truth docs.
3. Read enough canonical material to establish:
   - architecture flow
   - major invariants
   - runtime decision semantics
   - observability contract
   - verification strategy
4. Compare the external artifact to those sources.
5. Separate findings into:
   - correct but vague
   - incomplete
   - misleading by omission
   - inaccurate
6. Produce edit recommendations in `before / after / rationale` form.
7. If asked to update the artifact, preserve the artifact's audience and tone while tightening fidelity to the repo.

## Output Contract

Default output order:

1. overall judgment
2. highest-priority alignment gaps
3. section-by-section before/after wording
4. rationale tied to repo-backed contracts

When no meaningful issues are found, say so explicitly and note any residual risks:

- implementation may evolve faster than the artifact
- some sections may still be more abstract than the repo-level contract

## Editing Guidance

When proposing text:

- preserve the artifact's original audience
- avoid turning a portfolio or public-facing page into an internal runbook
- tighten semantics without overloading the reader with implementation detail
- prefer the smallest wording change that removes the mismatch
- add a new section only when the missing concept materially improves fidelity

## Common Mistakes

- reviewing only for literal inaccuracies and missing deeper semantic drift
- importing local repo vocabulary into the shared skill
- overfitting the output to one repository's documentation structure
- rewriting the artifact into a technical spec when the audience is external
- treating implementation details as required additions even when they do not change interpretation

## Relationship to Local Adapters

Use a repo-local adapter for:

- canonical doc locations
- local vocabulary
- local implementation references
- local invariants that matter during comparison
- local exclusions
```

## Proposed Canonical Playbook Draft

Target path:
`jackhpark-ai-skills/playbooks/external-doc-alignment-review.md`

```md
# External Doc Alignment Review Playbook

## Purpose

This playbook provides a reusable method for checking whether an external artifact accurately reflects a repository's documented behavior.

Use it with a repo-local adapter that points to the relevant canonical docs, vocabulary, and implementation references.

## Step 1: Classify the Artifact

Determine the artifact type and expected audience:

- public portfolio or case study
- internal architecture page
- PRD or planning doc
- launch note or release summary
- README or developer-facing overview

The audience determines how much precision is needed and how much detail is appropriate.

## Step 2: Establish Source of Truth

Collect the minimum set of repo-backed sources needed to judge fidelity:

- canonical architecture docs
- canonical terminology docs
- policy or guardrail docs
- observability docs
- verification or testing docs

Do not read everything. Read only enough to anchor the judgment.

## Step 3: Build the Comparison Frame

For the topic being reviewed, identify:

- architecture flow
- major invariants
- decision semantics
- eligibility rules
- budgeting, selection, or filtering layers
- observability promises
- verification method

These are the categories most likely to drift.

## Step 4: Compare for Meaning, Not Only Wording

Ask:

- Is anything directly wrong?
- Is anything true but misleadingly broad?
- Is a conditional behavior described as unconditional?
- Is an important constraint omitted?
- Does the document imply confidence or guarantees the repo does not make?
- Does the document flatten multiple system layers into one?

## Step 5: Prioritize Gaps

Rank findings by impact on interpretation:

- **High**
  - changes how a reader understands what the system guarantees
- **Medium**
  - omits an important layer, constraint, or limitation
- **Low**
  - technically acceptable but too vague or underspecified

## Step 6: Propose Edits

Prefer:

- small wording changes first
- section-local additions second
- structural rewrites only when the document's framing is fundamentally off

Use:

- `before`
- `after`
- `why this change matters`

## Step 7: Preserve Audience Fit

For public-facing or portfolio artifacts:

- keep the tone readable
- avoid replacing clear prose with internal jargon
- add only the technical precision needed to stop misinterpretation

For internal docs:

- bias toward stronger precision and explicit constraints

## Common Gap Taxonomy

### Architecture Drift
- write path/read path confusion
- conditional stages presented as always-on
- missing intermediate selection or filtering layers

### Policy Drift
- capability presented as force
- override semantics omitted
- guardrail ownership blurred

### Operational Drift
- lifecycle states omitted
- retrieval or feature eligibility rules omitted
- caching or fallbacks described too loosely

### Observability Drift
- "we log this" without diagnosability
- metrics named without stating what they distinguish

### Verification Drift
- quality claims without contract checks
- testing described only as subjective evaluation

## Recommended Output Format

### Overall Judgment
- 1 short paragraph on whether the artifact is directionally correct

### Findings
- ordered by importance
- each finding tied to a source-of-truth concept

### Proposed Edits
- before
- after
- rationale

### Residual Risks
- what still may drift later
```

## Recommended Local Adapter Shape

Any consuming repository should create a local adapter that includes:

- canonical source doc locations
- vocabulary map
- local implementation references
- repo-specific invariants that often get lost in external docs
- repo-specific exclusions

## Suggested First Consumer

If this method is later used in `nextjs-react-notion-x`, the wrapper and local adapter would likely look like:

- wrapper:
  - `ai/skill-wrappers/external-doc-alignment-review/SKILL.md`
- local adapter:
  - `docs/product/external-doc-alignment-review-local-adapter.md`

The adapter should point to local sources such as:

- `docs/canonical/rag/rag-system.md`
- `docs/00-start-here/terminology.md`
- `docs/telemetry/implementation/rag-observations.md`
- `docs/telemetry/langfuse-guide.md`
- `docs/testing/notion-rag-test-strategy.md`

## Promotion Checklist

Before promoting this draft into `jackhpark-ai-skills`:

1. confirm the shared repo path
2. create the canonical skill
3. create the canonical playbook
4. verify naming under the shared repo's existing taxonomy
5. add a local adapter only in repositories that actually consume the skill
