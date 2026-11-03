# Deadline Sweep and Redirect Security Follow-up

## Intent and authorization

On October 27, 2026, the owner requested fixes for the previously reported full-workspace ingestion deadline defect and Dependabot alerts 144/145, using subagent-driven implementation. Merge, deployment and monitoring-cadence changes remain held. Continue the existing Draft PR; do not change production data or the external publisher repository.

## Verified starting evidence

- Draft PR 240 remains open at `adc7ed3`, unmerged.
- Notion workers increment `pagesNotReached` and return before `markAttempt` when their deadline has expired. The full-workspace sweep currently checks discovery completeness but not this processing incompleteness. An old active row can therefore qualify for `missing` status; this is not hard deletion.
- Current scheduled deadline ingestion uses partial mode. The fix protects the exported full-workspace combination without changing that caller.
- Both open advisories affect follow-redirects `>=1.16.0 <1.16.1`; the lockfile resolves 1.16.0. Official advisories identify 1.16.1 as patched: [array-form headers](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8), [custom sensitive-header escaping](https://github.com/advisories/GHSA-8r9p-f939-6h3c).

## Approach and alternatives

Use the existing `pagesNotReached` evidence to disallow the missing-document sweep after deadline-skipped processing. This is the controller's minimal implementation choice for the owner's requested fix. Rejecting every full run with a deadline would unnecessarily narrow the API; stamping skipped pages as attempted would misrepresent lifecycle evidence. No redesign of discovery, sweep thresholds, retries, statuses, or persistent schema is needed.

Pin follow-redirects 1.16.1 through the repository's existing pnpm override mechanism and regenerate the lockfile with pnpm 10.29.3. Do not update unrelated libraries or introduce a direct production dependency solely for testing.

## Requirements

- Sweep only when full workspace discovery completed and `pagesNotReached === 0`.
- Retain the existing full/partial/selected and incomplete-discovery protections. Successful hash-skipped documents count as attempted, not deadline-skipped.
- A provided or elapsed deadline alone is not evidence of skipped processing: a run that processed every candidate may still sweep.
- Explain deadline-related sweep suppression through the existing log-event channel without new telemetry types or schema. Preserve attempt/failure bookkeeping, run completion, cache cleanup and deadline counters.
- Prove the bad path with real manual ingestion and controlled Notion/database/embedding boundaries, including some visited documents plus an active skipped candidate at or below the existing 25% sweep threshold. Assert no sweep query/status retirement and an incomplete completion receipt after the fix.
- Cover all-skipped processing, incomplete discovery, partial/selected runs, and a fully processed full run that may retire a genuinely missing document.
- Both vulnerable redirect cases must be exercised against the installed transitive library with synthetic credentials and loopback-only HTTP servers. The vulnerable installed version is the behavioral RED; the patched one must strip credentials across origins and preserve expected same-origin behavior.
- Resolve the installed package through declared dependency ancestry, not a machine-specific store path or an added production dependency. Check every lockfile resolution and retain dependency-path/audit evidence.
- Strict TypeScript, no `any`, no unrelated refactoring or dependency upgrades. English repository documentation/comments.
- No merge, deployment, monitor-cadence change, paid-tier change, operations-host installation, live provider calls or production database writes.

## Acceptance and limits

Each fix has behavioral RED/GREEN evidence, an isolated commit and an independent task review. Run the combined full suite, typecheck, lint, formatting, frozen-lockfile installation, dependency audit and CI-only fixture build; independently review the complete follow-up range. Push only the held feature branch and update Draft PR evidence with one line per paragraph/list item. Verify actual remote CI/CodeQL and keep auto-merge disabled.

GitHub default-branch Dependabot alerts may remain open until a separately authorized merge. A patched draft lockfile and passing behavioral tests do not establish default-branch remediation, production deployment or absence of all security risks. Preserve evidence and remove only this task's finished checkout.
