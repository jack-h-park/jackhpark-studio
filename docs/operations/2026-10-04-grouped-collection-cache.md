# Grouped Collection Cache Diagnosis — October 4, 2026

## Confirmed cause

`isGroupedQueryPayloadUsableForView` compared result bucket names against the
grouping property ID (`results:<property>:...`). The installed Notion client
constructs those buckets as `results:<type>:<group-value>`, and the installed
collection renderer reads that same type/value shape. A property such as
`docType` and a bucket such as `results:select:profile` are therefore compatible,
not evidence of stale grouped data.

The incorrect comparison scheduled a collection query even with a complete
renderable query already present. This applies both after a fresh page fetch and
on page-cache hits because both paths run grouped finalization.

## Reproduction and bounded fix

Behavioral tests use the real page loader, cache, normalizer, and hydration path,
with only external Notion reads replaced by deterministic responses. Gallery,
list, and board fixtures each reproduced two extra collection reads across one
fresh and one warm page read before the fix. With the corrected classifier,
those complete fixtures perform zero extra collection reads and retain their
grouped block IDs, including a visible empty group.

The classifier now derives keys from the current visible format groups using
the same type/value mapping as the client and renderer. It requires an array of
block IDs for every visible group, rather than accepting one matching bucket
as proof that all groups are complete. Hidden groups stay hidden and do not
require their own result buckets. Missing and malformed visible buckets, absent
group definitions, and aggregate-only results still take the hydration path.
Complete all-empty groups also avoid hydration. Boards additionally require
column reducer metadata for each visible column. Gallery/list boolean and numeric
labels use their renderer-compatible string form; dates, uncategorized groups,
and labels containing colons remain supported. The installed board renderer has
different scalar/date handling, so reuse for boards remains limited to string
and uncategorized labels; other board label shapes retain hydration. This patch
does not repair those dependency-renderer limitations or change the existing
group-format repair behavior.

## Limits and rollout gate

Local verification passed 15 focused behavioral tests, 441 unit tests, telemetry
golden checks, typecheck, lint, and a production build including the sitemap trace
check. Lint retained five existing warnings. The build retried Notion HTTP 429
responses and retained the existing large-page-data warning for `/studio`.

A browser comparison of the local production build and the current production
`/studio` showed two rendered collections and 24 cards on each, with identical
ordered card links and text. Neither displayed grouped containers in that sampled
view, so this is a default-view rendering regression check, not live proof of
grouped gallery/list/board rendering. Grouped behavior is fixture-verified until
an exact deployed release and representative grouped view are checked.
The local server lacked chat runtime environment configuration and logged Notion
image optimizer HTTP 403 responses with original-image fallback. This check did
not verify chat execution or image optimization performance.

This change does not remove Notion data, change collection filters, alter cache
TTL, disable hydration, add a sliding deadline, change manual refresh, alter
monitoring, or touch conversation/ingestion behavior. It does not add logging,
dependencies, schemas, or environment variables.

An earlier cached public `/studio` snapshot contained four grouped views whose
type/value bucket keys did not match the old property-prefix rule. That snapshot
supports targeting the classifier but is not an origin trace or a before/after
regeneration comparison. Fixture call-count reductions are not a measured
percentage reduction in production CPU or ISR writes. No billing reduction is
claimed before merge, exact production rollout, and comparable Usage windows.

After an independently reviewed and approved rollout, verify grouped gallery
and list content on the exact deployed release. Compare CPU, origin-query
activity, and ISR write units separately, retaining deployment and sweep events.
An administrator-triggered production refresh requires separate approval; do
not force refresh or sweep the sitemap simply to gather evidence.

Rollback is to revert this bounded classifier change. Keep the route guard,
public chat projection/CDN cache, hourly ISR interval, and image delivery changes.
