# Discovered Group Repair — October 4, 2026

## Confirmed evidence

After PR 219 reached Production, `/experience-background` declared an
`AI Engineering & Observability` group without its matching result bucket.
The rendered group appeared empty. A bounded read of that specific Notion view
returned four actual rows when all four declared groups were requested.
This was missing data, not an authoritative empty group.

A second targeted read reproduced the mismatch: requesting the older three
groups plus uncategorized returned those requested buckets, while `list_groups`
advertised the fourth group as well. The installed `notion-client` builds result
reducers from the supplied view's group definitions; the groups reducer discovers
groups independently. Its complete groups list does not establish complete row
results for each discovered group.

The supplemental bootstrap previously required empty group definitions. A
partially populated definition therefore bypassed the follow-up needed to fetch
the newly discovered group's rows. A cache classifier that checked only the
old definitions could also accept the incomplete query.

## Bounded correction

- Check visible groups advertised by the groups reducer as well as the view's
  existing definitions. Missing or malformed row buckets remain incomplete.
- When a collection response advertises a visible group without a usable bucket,
  perform at most one follow-up query using the discovered group definitions.
  Do not invent empty buckets or loop until the response becomes complete.
- Keep a cached record map's merged block bags coherent with its repaired query.
  Otherwise a warm read can contain new row IDs but omit their actual blocks.
  This updates the existing object, not its expiry or persistent cache deadline.

An explicitly returned empty `blockIds` array remains valid. Hidden groups do
not require row buckets. This correction does not change filters, cache keys,
TTL, manual refresh ownership, hydration concurrency, navigation scope, or ISR.
It adds no dependency, environment variable, logging, or scheduling.

## Verification and rollout boundaries

Regression tests cover list and gallery reads through fresh, memory, and
persistent paths, followed by warm reads retaining fetched blocks. Additional
cases cover explicit empty results, hidden groups, incomplete follow-up responses,
and follow-up failures that retain the successful first response's rows and
blocks. Memory-path tests also advance the clock past the original expiry to
verify that repairing a hit does not extend its deadline.

Local verification passed 467 unit tests and telemetry golden checks, typecheck,
lint (zero errors and five existing warnings), changed-file formatting, path/CSS
guardrails, and the server-only import check. Independent review found no
remaining blocking issues after the first-response failure-path correction.
Production builds are separately verified through pull-request CI.

An additional replay used the deployed page props and a single targeted Notion
response, then disabled networking. The repaired cached page contained all four
missing-group row IDs and their blocks; its subsequent warm read performed no
additional collection query. This verifies the patch against sampled production
data locally, not against a deployment containing the patch.

Production HTML and the targeted Notion reads establish the diagnosis, not the
rollout of this patch. Merge and exact deployment verification are separate
gates. After an approved rollout, inspect the four missing rows on the exact
deployed `/experience-background` release without forcing an administrator
refresh or sweeping the sitemap.

The correction may spend one extra query to complete a genuinely incomplete
response, then avoid repeating repair on a coherent warm page. It does not prove
a global reduction in CPU or ISR Write billing. Actual savings require comparable
Vercel Usage-dashboard windows; no quota recovery is claimed from fixture counts.
