# Batched Usage Prevention — October 4, 2026

## Delivery policy

PR 220 remains unmerged. Finish the remaining confirmed fixes, verify the combined
change, and update that PR once. Do not merge or deploy intermediate patches.
Deployment needs separate approval. An urgent incident would require an explicit
decision to deviate from this policy.

The original PR 220 CI retry succeeded. One earlier push build failed while
prerendering `/studio` because Notion `loadPageChunk` returned HTTP 429; compilation,
tests, and the other three builds passed. This is external API pressure in GitHub
Actions, not evidence of Vercel CPU billing.

## Confirmed remaining paths

### Overlapping warm grouped repairs

Cold page loads already shared an in-flight promise, but warm memory and persistent
hits finalized outside that boundary. Five overlapping reads of the same incomplete
cached fixture performed five identical collection queries.

Warm finalization now shares the existing in-flight page boundary. The same fixture
performs one collection query and all readers receive repaired group data. The
entry is released when repair ends; a later repair can proceed after a failure.
Manual refresh bypasses ordinary repair and remains the authoritative cache writer,
regardless of which operation completes first. Repair does not write the persistent
cache, extend the TTL, or claim refresh ownership.

This coalescing is process-local. It does not coordinate different Vercel instances,
persist repaired data across instances, or establish global query savings.

### Complete data with stale render group metadata

The installed list/gallery renderer iterates `format.collection_groups`, not every
result bucket. A complete query can therefore omit a newly discovered group from
the screen when its view metadata still declares only older groups.

For complete v2 group discovery (`hasMore: false`) with usable visible row buckets,
append newly discovered groups before accepting a cached query and after a fresh
query. Retain existing group order, explicit hidden flags, and empty groups.
Missing visible buckets still require bounded hydration; no empty bucket is
invented. Board positional metadata is deliberately not rewritten by this repair.

### Duplicate feature-branch CI builds

The previous workflow ran for every push and pull request. For a PR revision,
the Node.js 20/22 matrix ran twice, producing four full builds that can query Notion.
Workflow concurrency used different refs for those events, so it did not deduplicate
them.

Limit push CI to `main`, while retaining pull-request CI and both Node.js build
versions. Feature pushes before opening a PR no longer trigger this workflow; PR
creation and updates still do. Main updates still run both checks. Keep job names
and test/type/lint/server-only/build gates unchanged. This reduces a normal feature
PR revision from four builds to two, not to zero. It does not disable security
workflows, change Vercel Preview policy, or guarantee that Notion will never throttle.

Reference: [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

## Verification and boundaries

Use deterministic Notion responses and the real page loader/cache for concurrency,
manual-overlap, failure cleanup, and metadata tests. Parse the actual CI YAML to
verify enabled build counts and retention of required job names and commands.
Run the full test suite, typecheck, lint/guardrails, and changed-file formatting
before the single PR update. Independent review is required.

The combined local suite passed 480 unit tests plus telemetry golden checks.
Typecheck, lint (zero errors, five existing warnings), CSS/path-leak guardrails,
and server-only import checks passed. Review exposed an older wholesale list-group
rewrite that undid metadata preservation; regression tests now cover its fetched,
bootstrap, and all-hidden paths, and the rewrite has been removed.
These checks are not a production build or deployment verification.

No production forced refresh, sitemap sweep, chat generation, ingestion, paid
processing, new schedule, migration, logging, dependency, or environment variable
is part of this batch. Production appearance and actual CPU/ISR Write savings
remain separate post-rollout checks. Usage-dashboard windows, not fixture counts,
establish billed impact.

Rollback is to revert the batch commit and, if necessary, the original PR 220
commit. No persistent data migration or environment change is required.
