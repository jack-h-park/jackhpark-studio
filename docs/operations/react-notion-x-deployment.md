# react-notion-x Deployment

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

Do not commit and push a production deployment while `package.json` or `pnpm-lock.yaml` still points at local fork paths. Local paths can work on the developer machine, but CI, Vercel, and other machines do not have this repository's sibling fork layout.

Use the deployment script from this repository:

```bash
pnpm run deploy:rnx <tag>
```

Example:

```bash
pnpm run deploy:rnx 7.7.1-jp.5
```

The script performs four steps:

1. Creates and pushes the Git tag in the `react-notion-x` fork.
2. Rewrites this repository's dependencies to `github:jack-h-park/react-notion-x#<tag>`.
3. Runs `pnpm install` to regenerate `pnpm-lock.yaml`.
4. Commits `package.json` and `pnpm-lock.yaml`, then pushes `main` to trigger Vercel.

The remote switch applies to the whole Notion package family used by this app:

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

## Tag Naming

Use this format:

```text
7.7.1-jp.<n>
```

Where:

- `7.7.1` is the upstream `react-notion-x` base version.
- `jp` identifies the personal fork lineage.
- `<n>` increments by one for each deployment tag.

Use a new tag for each deployment. Do not force-push over an existing deployment tag; package managers and deployment environments can cache GitHub tarballs or lockfile resolutions for the old tag target.

## Dependency States

| Mode                  | `package.json` state                                            |
| --------------------- | ---------------------------------------------------------------- |
| Local development     | Local `file:` / `link:` references                               |
| Production deployment | `github:jack-h-park/react-notion-x#<tag>` for `react-notion-x`   |

## Preconditions

Before running `pnpm run deploy:rnx <tag>`:

- Confirm the local fork exists at `../../forks/react-notion-x`.
- Confirm both repositories are on the intended commits.
- Confirm the tag does not already exist locally or remotely.
- Confirm this repository is ready to push to `main`.
- Confirm unrelated local changes will not be included in the deployment commit.
- Run any relevant build, smoke, or visual checks manually. The deployment script does not run tests.

Before pushing a production deployment, confirm:

- `package.json` does not contain local `file:` or `link:` references for the Notion package family.
- `pnpm-lock.yaml` does not contain local `link:` entries for `react-notion-x`, `notion-client`, `notion-types`, or `notion-utils`.
- `react-notion-x` resolves to the intended `github:jack-h-park/react-notion-x#<tag>` value.

## Failure And Recovery Notes

If deployment fails after switching dependencies to remote mode, inspect `package.json` and `pnpm-lock.yaml` before retrying.

To return to local development mode:

```bash
pnpm run deps:use-local
pnpm install
```

If the tag was pushed but the app repository commit failed, either reuse the pushed tag by manually switching dependencies to that tag or create a new tag after confirming the fork state.
