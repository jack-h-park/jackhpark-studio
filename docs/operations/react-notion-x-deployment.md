# react-notion-x Deployment

> **Updated 2026-06-03** — Added `pnpm deps:release` automation script and
> pre-push safety hook. The old `deploy:rnx` script is still present for
> compatibility but `deps:release` is now the preferred path.

This document describes how this repository consumes and deploys the local `react-notion-x` fork.

## Repository Layout

The deployment scripts assume the `react-notion-x` fork exists at a path relative to this repository:

```text
workspace/code/
  core/
    nextjs-react-notion-x/
  forks/
    react-notion-x/
```

From this repository, the fork is resolved as:

```text
../../forks/react-notion-x
```

Do not use `deploy:rnx` or `deps:use-local` unless the fork exists at that relative path, or the scripts have been updated together.

## Local Development Mode

Local development mode rewrites the `react-notion-x` package family to local fork references.

From this repository:

```bash
pnpm run deps:use-local
pnpm install
```

This updates `package.json` so:

- `react-notion-x` points at the local fork through a `file:` reference.
- `notion-client`, `notion-types`, and `notion-utils` point at the local fork through `link:` references.
- `pnpm.overrides` forces the same local package family during resolution.

Then start the app:

```bash
pnpm dev
```

After dependencies are linked locally, package relinking usually does not require another `pnpm install`. If the fork package output is build-based, rebuild or watch the fork package as needed.

## Production Deployment Mode

Vercel cannot resolve local `file:` or `link:` dependency paths. Production deployments must use a remote GitHub tag for `react-notion-x`.

Do not commit and push a production deployment while `package.json` or `pnpm-lock.yaml` still points at local fork paths.

### Preferred: automated release script

```bash
pnpm deps:release            # auto-increments jp.N (e.g. jp.3 → jp.4)
pnpm deps:release 7.7.1-jp.5 # or explicit tag
```

The script (`scripts/release-fork.js`) performs these steps automatically:

1. Reads the current version from the fork's root `package.json`.
2. Bumps the version field to the new tag (fixes the tag-vs-version mismatch problem).
3. Commits, tags, and pushes the fork to GitHub.
4. Runs `switch-rnx-deps.js remote <tag>` to rewrite this repo's dependencies.
5. Runs `pnpm up react-notion-x` to regenerate `pnpm-lock.yaml`.
6. Prints the remaining manual steps.

After the script completes, commit and push manually:

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): upgrade react-notion-x to <tag>"
git push
```

### Legacy: manual steps (still works)

```bash
# 1. In the fork — bump version, commit, tag, push
cd ../../forks/react-notion-x
# edit package.json version → new tag name
git add package.json && git commit -m "chore: bump version to <tag>"
git tag <tag> && git push origin HEAD <tag>

# 2. Back in this repo
cd -
node scripts/switch-rnx-deps.js remote <tag>
pnpm up react-notion-x
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): upgrade react-notion-x to <tag>"
git push
```

> **Important:** Always bump the fork's root `package.json` `version` field to
> match the tag name before tagging. Mismatches cause the pnpm lockfile to
> report a different version than the git tag, which creates confusion.

The remote switch applies to the whole Notion package family:

- `react-notion-x` becomes a GitHub tag dependency.
- `notion-client`, `notion-types`, and `notion-utils` become published `7.7.1` dependencies.
- local `pnpm.overrides` entries for those packages are removed.

This package-family switch matters because Vercel installs with the lockfile. If `pnpm-lock.yaml` still contains local `link:` entries after `package.json` has been switched, the deployment can still fail even though `package.json` looks remote-ready.

## Returning To Local Development

After a production deployment, switch back to local fork references before resuming fork development:

```bash
pnpm run deps:use-local
pnpm install
```

## Pre-push Safety Hook

A git hook blocks pushes when `package.json` still contains local `file:`/`link:`
references. This prevents accidental Vercel build failures.

**Install once** (after cloning or when the hook is updated):

```bash
pnpm setup-hooks
```

The hook source lives at `scripts/hooks/pre-push` (tracked in git).
The installed hook at `.git/hooks/pre-push` is not tracked (standard git behavior).

If a push is blocked, the hook prints the exact commands to run:

```
╔═══════════════════════════════════════════════════════════════╗
║  ❌  Push blocked — react-notion-x is in LOCAL mode           ║
║  Run: pnpm deps:release  or  switch-rnx-deps.js remote <tag>  ║
╚═══════════════════════════════════════════════════════════════╝
```

## Tag Naming

Use this format:

```text
7.7.1-jp.<n>
```

Where:

- `7.7.1` is the upstream `react-notion-x` base version.
- `jp` identifies the personal fork lineage.
- `<n>` increments by one for each release.

`pnpm deps:release` auto-increments `<n>` if no tag is provided.
Use a new tag for each release. Do not force-push over an existing deployment tag
unless you also run `pnpm deps:release` (or manually `pnpm up react-notion-x`) to
refresh the lockfile, as pnpm and Vercel cache GitHub tarballs by commit hash.

## Dependency States

| Mode | `package.json` state | `pnpm.overrides` |
|---|---|---|
| Local development | `file:` / `link:` references | local `link:` entries |
| Production deployment | `github:jack-h-park/react-notion-x#<tag>` | `{}` (empty) |

## Preconditions

Before running `pnpm deps:release` or pushing manually:

- Confirm the local fork exists at `../../forks/react-notion-x`.
- Confirm both repositories are on the intended commits with no uncommitted changes.
- Confirm unrelated local changes will not be included in the deployment commit.
- Run any relevant build, smoke, or visual checks manually. The scripts do not run tests.

The pre-push hook automatically enforces the dependency state, but verify manually before significant releases:

- `package.json` does not contain `file:` or `link:` references.
- `pnpm-lock.yaml` does not contain local `link:` entries.
- `react-notion-x` resolves to the intended `github:jack-h-park/react-notion-x#<tag>` value.
- The fork's root `package.json` `version` field matches the git tag name.

## Failure And Recovery Notes

If deployment fails after switching dependencies to remote mode, inspect `package.json` and `pnpm-lock.yaml` before retrying.

To return to local development mode:

```bash
pnpm run deps:use-local
pnpm install
```

If the tag was pushed but the app repository commit failed, either reuse the pushed tag by manually switching dependencies to that tag or create a new tag after confirming the fork state.
