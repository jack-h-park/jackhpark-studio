# Path-Leak Guardrail

This repository is public, so every tracked file is published. Two shapes of path do not belong in one, and nothing else in the toolchain catches them.

## Rules

1. **`escaping-link`** — a relative Markdown link or image whose target resolves outside the repository root.
   - **Why:** it only works on the author's machine. Every other reader gets a broken link, and the link publishes the surrounding directory layout.
   - **Fix:** link by repo name plus in-repo path (``the `some-repo` repo (docs/thing.md)``), or by URL if the target is published.
2. **`machine-local-path`** — a home directory (`/Users/<name>/`, `/home/<name>/`) or the `~/workspace/` convention.
   - **Why:** same leak, and the value is useless to anyone else.
   - **Fix:** take it from an argument, with an in-repo default. (ESLint's `no-process-env` rules out an env var in app and scratch code.)

Scope: tracked files with a text extension. Lockfiles are skipped. Rule 1 applies to `.md` / `.mdx`; rule 2 applies to all of them.

## How to run locally

```bash
pnpm lint:path-leaks
```

`pnpm lint` runs it after ESLint and the CSS guardrails.

## Sample failure output

```
docs/brand-guidelines.md:31 [escaping-link] ../../../../ai-assets/some-repo/docs/guide.md
scratch/capture.js:12 [machine-local-path] /Users/someone/
```

## Why it matches shapes, not names

The check never carries a list of private repository or product names. A denylist committed to a public repo would publish the very list it protects.

The naming half is covered separately, by `.github/workflows/pr-text-sensitive-check.yml`: it compares a PR's title and description against a `PR_SENSITIVE_TERMS` **repo secret**, so the public workflow file never names what it checks for. That covers GitHub metadata — which a history rewrite can never reach, because a PR's own text is not a git object. This check covers file contents, and does it structurally, which is enough because a private path form is itself a shape.

The workflow **skips until the secret is set**:

```bash
gh secret set PR_SENSITIVE_TERMS --repo jack-h-park/jackhpark-studio
```

One real identifier per line, from the "Real value" column of the aliases doc. Two blind spots are recorded in the workflow's own comments: a PR created or edited through the raw REST API does not reliably fire the `pull_request` event, and a PR from a fork receives no secrets.

Background on the naming rules and the aliases to use instead: workspace-governance's `docs/public-safe-aliases.md`.

## What this does not cover

- Real names written in prose without a path (`hermes-control-plane` alone is allowed — the repo name is not the secret; the `jackhpark-` prefixed local-path form is). Enforcing that needs the secret-backed term list, not this check.
- PR **comments**. The workflow above reads a PR's title and description only; a comment added later is checked by nothing.
- Anything already published. The guardrail is preventative; a value that has shipped needs the purge path in workspace-governance's `docs/public-release-readiness.md`.

## Origin

Added after a 2026-09-10 edit to `docs/brand-guidelines.md` sat uncommitted for ten days carrying `../../../../ai-assets/<private-repo>/...` links. It was written in a session working across both repositories, where the path resolved correctly in the editor. Nothing mechanical ever looked at it, because the repo's only content check at the time was the CSS guardrail — and because the edit was never committed, the commit-time and PR-time checks never saw it either.
