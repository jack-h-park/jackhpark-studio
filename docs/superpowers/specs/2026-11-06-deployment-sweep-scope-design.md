# Change-aware deployment verification

## Intent and approval

The owner approved the preceding audit's recommendation to narrow post-deployment verification for unrelated static changes while retaining full coverage for Notion rendering, routing and unknown changes. Merge, deployment and existing monitor cadence changes remain on hold. This document records implementation choices within that approved scope; it does not claim owner approval of each detail.

## Approaches

- Always sweep every sitemap URL: strongest uniform coverage, but repeats cold generation for unrelated deck changes.
- Skip verification for static changes: cheaper, but loses both deployment health and changed-asset checks.
- Selected approach: retain representative checks for a narrowly proven static-only change; use the full sweep whenever evidence is incomplete.

## Contract

Only additions or modifications to regular `public/decks/<lowercase-slug>/index.html` files qualify initially. Check `/`, `/chat`, `/studio`, `/experience-background`, `/aws`, `/beluga` and every changed deck URL. Other assets, deletions, renames, runtime changes and an empty diff require the full sweep. This is deliberately narrower than a generic public-directory exemption.

Compare the deployed SHA against the most recent prior successful Production deployment, not its parent commit. Require a completed successful sitemap sweep for that baseline SHA, so a failed runtime verification cannot be hidden by the next deck-only release. Resolve historical metadata using bounded read-only GitHub API requests. Invalid events, missing history, API failures, stale deployment events, rollback, same-commit redeploy, mismatched checkout and uncertain file modes all select full coverage.

The workflow checks out the deployment SHA with full history, creates a bounded scope plan and runs the existing dependency-free smoke runner. Manual invocation stays full. The runner accepts only a validated representative plan with all fixed canaries and safe deck paths; absent or invalid plans retain full sitemap enumeration. Existing retries and failure exit codes remain intact. No Production requests are permitted in local tests; loopback servers and temporary Git repositories supply fixtures.

The lookup inspects at most twenty Production deployments and twenty recent verification runs across all SHAs, with bounded status/job pages and a time budget. The latest prior verification must match the baseline SHA; a newer skipped, failed or mismatched run retains full coverage. Empty or truncated status histories, activation-order inversions and any newer Production deployment select full coverage. Scope-tool startup failure also retains the sweep. A Git diff cannot establish whether external Notion content or dashboard environment settings changed; operators must use the unchanged manual full-sweep entry point when those inputs need verification.

## Non-goals

Do not change Vercel build admission, one-hour ISR, upstream cache TTLs, monitor scheduling, paid tier, app runtime, ingestion, signing or media behavior. Do not remove the full sweep's protection against missing leaf pages. Reduced request count is not a measured billing saving; live execution awaits a separately approved release.
