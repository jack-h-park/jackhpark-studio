# Verifying a Preview Deployment

Preview deployments sit behind **Vercel Authentication** (`ssoProtection:
all_except_custom_domains`), so an unauthenticated request to a preview URL gets
a `302` to `vercel.com/sso-api` and never reaches the app. Production is exempt
because it serves from a custom domain.

Two ways through: sign in with the Vercel account in a browser, or send the
**Protection Bypass for Automation** secret from a script.

## Protection Bypass for Automation

Enabled per project under **Settings → Deployment Protection → Protection Bypass
for Automation**. Creating a secret is the whole setup — it is checked by Vercel's
edge, not by application code, so nothing needs to be pasted into `.env` or the
codebase.

Verified 2026-08-26: an existing preview deployment accepted the secret
**without a redeploy**. The Vercel docs warn that regenerating or deleting a
secret invalidates deployments built before the change, so a redeploy is only
needed after rotating it.

Reading the secret back (it is a _system_ environment variable, so
`vercel env pull` does not include it):

```bash
TOKEN=$(python3 -c "import json;print(json.load(open('$HOME/Library/Application Support/com.vercel.cli/auth.json'))['token'])")
curl -s "https://api.vercel.com/v9/projects/$PROJECT_ID?teamId=$TEAM_ID" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;print(next(iter(json.load(sys.stdin)['protectionBypass'])))"
```

Ordinary project variables such as `DEBUG_API_SECRET` **are** covered by
`vercel env pull --environment=preview`. Delete the pulled file afterwards — it
contains every secret for that scope.

## Two independent gates

A request to the debug endpoint has to clear both. They are unrelated, and
mixing them up is the usual source of confusion.

| Gate                         | Enforced by                                          | How it is satisfied                               |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Vercel Deployment Protection | Vercel edge, before the app runs                     | `x-vercel-protection-bypass` header               |
| `DEBUG_API_SECRET`           | `pages/api/_debug/runtime.ts`, returns 404 otherwise | `?secret=` query param or `x-debug-secret` header |

Bypassing Vercel does not expose the debug endpoint; it still 404s without the
application secret.

## Telemetry probe

`/api/_debug/runtime?secret=…&span=1` emits one span through the Langfuse OTel
pipeline, flushes it inline, and returns its trace id. Use it to confirm the
export path works in an environment before trusting real telemetry there.

```bash
curl -s -H "x-vercel-protection-bypass: $BYPASS" \
  "$PREVIEW_URL/api/_debug/runtime?secret=$DEBUG_API_SECRET&span=1"
```

```json
{
  "node": "v24.18.0",
  "nextRuntime": "nodejs",
  "appEnv": "preview",
  "vercelEnv": "preview",
  "region": "iad1",
  "probeTraceId": "4a0496c50d51347f2e9b50d37f3cb4b9"
}
```

`appEnv` comes from `getAppEnv()` and is what Langfuse tags the trace with. If it
reads `prod` on a preview deployment, the deploy-target resolution is broken —
see the Phase 0 section of
[langfuse-v4-migration-plan.md](../implementation/plans/langfuse-v4-migration-plan.md).

Then look the trace up:

```bash
curl -sG "$LANGFUSE_BASE_URL/api/public/v2/observations" \
  -H "Authorization: Basic $LANGFUSE_AUTH" \
  --data-urlencode "traceId=$PROBE_TRACE_ID" --data-urlencode "fields=core"
```

## Exercising the chat endpoint

```bash
curl -s -X POST "$PREVIEW_URL/api/langchain_chat" \
  -H "x-vercel-protection-bypass: $BYPASS" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What does Jack do?"}]}'
```

## Ingestion lag is the trap

**Langfuse takes roughly 8 minutes to make a trace queryable.** An empty query
before then proves nothing.

Two mistakes already made against this repo, both worth avoiding:

1. Concluding a trace was dropped after querying a few minutes in. It arrived on
   schedule.
2. Polling for "any observation in the window" and exiting on a _different_
   trace that had been created a minute earlier. Scope the poll so it can only
   match the trace you are actually waiting for — by trace id, or by a
   `fromStartTime` after the request you sent.

## Related

- [langfuse-v4-migration-plan.md](../implementation/plans/langfuse-v4-migration-plan.md)
- [langfuse-v4-phase3-otel-bootstrap.md](../implementation/plans/langfuse-v4-phase3-otel-bootstrap.md)
- [../telemetry/setup.md](../telemetry/setup.md)
