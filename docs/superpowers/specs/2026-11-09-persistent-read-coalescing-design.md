# Persistent Page Cache Read Coalescing

The owner approved eliminating repeated persistent-cache decoding for simultaneous same-page requests while preserving manual refresh and expiration behavior. Append this change to held Draft PR248; no merge, deployment, monitoring cadence, cache lifetime or telemetry changes.

## Approach

Share the existing persistent read and its post-read refresh/memory precedence checks using a separate per-cache-key promise map. The current origin/repair promise map must remain separate: registering the cache read there would let the existing active-fetch check join its own promise. Sharing the entire page operation would also complicate forced refresh and write ownership unnecessarily.

Force refresh continues to bypass memory and persistent reads and start its existing owned origin operation. Ordinary readers already waiting on persistent storage must observe an active or completed refresh through the existing post-read checks. Sharing ends when a read settles, on success, miss, or failure. Retaining a completed promise would bypass absolute deadlines and error recovery. Different keys remain independent; normalized aliases of one key share work.

## Verification

Observe a real Keyv read/decode-count regression fail before implementation. Exercise shared hits, misses, cache errors, different keys, absolute expiration after a hit, and renewed lookup after completion. Preserve active/completed manual refresh precedence and failed-refresh recovery with deterministic gates and existing ownership tests. Use local cache/Notion fixtures only. Re-run the offline concurrent profile, full tests, typecheck, lint/guards and fixture build, then obtain a fresh independent review. Do not equate local CPU changes with measured Vercel savings.
