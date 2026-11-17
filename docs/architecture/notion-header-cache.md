# Navigation header cache and revision authority

This document describes the durable revision path prepared after the repeated `revision_not_retained` incidents. Production effectiveness must be verified separately after an authorized release; passing offline tests is not release evidence.

## Separate authority from disposable data

| State               | Storage                                     | Lifetime and purpose                                                                   |
| ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Current revision    | Existing primary Supabase `system_settings` | Durable control row; changes on explicit refresh or initialization after a missing row |
| Slim header payload | Vercel Runtime Cache                        | Disposable, generation-keyed data with an absolute one-hour deadline                   |
| Public chat HTML    | Vercel CDN                                  | Existing response TTL and independent chat invalidation policy                         |

Runtime Cache is regional, ephemeral, and evictable. Its tag expiration promise acknowledges an expiration request; it is not a transaction that guarantees immediate read-after-write or globally consistent generations. A cache miss must not prevent a successful control-state update. The previous design placed the authority under the same tag that refresh expired, coupling correctness to cache retention and propagation.

The saved Production audit proved three absent marker observations on the request-context cache after Runtime Cache expiration. It did not identify a private platform write, eviction, or invalidation event. The design change removes that dependency without claiming retrospective infrastructure causality.

## Durable revision protocol

The Vercel non-Redis path uses an explicit revision store. Other local and legacy Redis behavior remains supported.

1. Read the current durable revision before looking up a payload.
2. If the row is absent, insert a random UUID with `ignoreDuplicates` on the primary key. A concurrent initializer or refresh wins; initialization adopts its revision and never overwrites it.
3. Read the payload under the revision-specific v2 key, or fetch and project a slim header on a miss. Payload writes are best effort.
4. Read the durable revision again before returning the result. A changed revision discards the older result and performs the existing bounded retry.
5. On manual refresh, replace the durable revision and verify its retention. Do not expire Runtime Cache tags in this mode: old payload generations become unreachable and expire naturally.

The authority row key is `notion_header_revision:v1:` plus SHA-256 of the logical v2 revision key. The logical key includes domain, deployment environment, and root page ID. It cannot collide with `admin_chat_config` or other settings keys. Values are UUID strings in the existing `value` column, with `updated_at` metadata. No schema migration or new service is needed.

The existing server-only primary client is required. Reads must not be redirected to a lagging read replica. The adapter imports it lazily; neither module import nor loader construction accesses credentials or the database. The first future runtime load with a missing row can create that single scoped control row. Implementation and tests do not perform live writes.

## Failures and concurrency

- Primary read failure: origin header requests are shared only while pending; unverified fallback headers remain `private, no-store`.
- Primary queries carry a five-second abort deadline; a canceled write may have committed, so it is reported as failure and never retried automatically.
- Failed or unverified revision persistence: manual refresh fails explicitly. A missing marker is not silently accepted.
- Runtime Cache outage or lost payload write: an ordinary data miss; it does not own the revision and does not block its update.
- Deleted authority row: initialize a new random generation, never revive an old payload key.
- Late fill: an older operation can write only its older payload key. Final authority checks fence it from current responses.
- The local mutation queue orders initialization and manual writes within an instance. Atomic insert-if-absent handles concurrent cold initializers across instances; the primary row owns the shared value.

These checks do not lock HTTP responses against a refresh that occurs after the final read, invalidate already-delivered HTML, or prove CDN propagation. The existing refresh order is page revalidation, header revision update, then explicit chat CDN invalidation. A later failure can leave earlier stages completed; audit evidence must retain partial completion and operators must not retry automatically.

## Cost and operational verification

A normal verified header load makes two primary row reads, in addition to a best-effort payload read. Initial row creation adds an insert and may add a read after a conflict. CDN hits do not run this loader. There is no long-lived local authority cache that could hide another instance's refresh.

This trades database queries and network latency for a control-state contract the disposable cache cannot provide. It is not a measured CPU reduction or a guarantee of unused Supabase allowance. One-hour payload expiry, origin request coalescing, and the existing CDN TTL remain unchanged. Review actual query latency and free-tier usage after a separately approved rollout.

Before a release, verify exact-head CI, primary table access and the scope of the new row. After authorization, verify the deployed commit, one refresh, its durable-revision audit, the body, and CDN behavior. Do not infer freshness from HTTP 200 or HIT alone. No rollout, refresh retry, or monitoring cadence change is implied by this document.
