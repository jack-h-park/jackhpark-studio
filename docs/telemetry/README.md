# Telemetry Docs

## Three observability backends at a glance

| Tool | Role / Focus | Where it lands | Primary docs |
|------|--------------|----------------|--------------|
| **Langfuse** | LLM engineering observability — trace/span/generation, latency waterfalls, RAG quality, cost | Custom `LangfuseTrace` (primary) + a separate node-span trace, US region | [langfuse-guide.md](langfuse-guide.md), [implementation/rag-observations.md](implementation/rag-observations.md) |
| **PostHog** | Product analytics — pageviews, retention, operational alerts (A/B/C) | `$pageview` (client) + `chat_completion` (server) | [posthog-ops.md](posthog-ops.md), [implementation/posthog-tracking-inventory.md](implementation/posthog-tracking-inventory.md) |
| **LangSmith** | LangGraph graph-level observability — full nested view of the retrieval graph for visual debugging | Auto-traced run `rag-retrieval-graph` in the `LANGSMITH_PROJECT` project (**`jackgpt-rag`**, not `default`) | [architecture/langchain-chat-architecture.md § Trace topology](../architecture/langchain-chat-architecture.md#trace-topology-langfuse--langsmith) |

> **LangSmith has no dedicated doc by design** — it requires no bespoke instrumentation (just `LANGSMITH_*` env vars) and exists as a complementary, fully-nested view of the same graph Langfuse observes. If LangSmith looks empty, confirm the dashboard project selector is set to `jackgpt-rag`, not `default`.

## Read First

- Canonical contract: [alerting-contract.md](../canonical/telemetry/alerting-contract.md)
- Canonical playbook: `jackhpark-ai-skills/playbooks/telemetry-operational-verification.md`
- Local supplement: [operations/telemetry-operational-verification-local.md](operations/telemetry-operational-verification-local.md)

## Analysis

- [weekly-digest.md](weekly-digest.md) — `pnpm telemetry:digest` turns Langfuse scores into an actionable digest (satisfaction, retrieval quality, proxy-vs-human divergence, rule-based takeaways)

## Operational References

- [implementation/telemetry-logging.md](implementation/telemetry-logging.md)
- [implementation/posthog-tracking-inventory.md](implementation/posthog-tracking-inventory.md)
- [implementation/rag-observations.md](implementation/rag-observations.md)
- [langfuse-guide.md](langfuse-guide.md)
- [posthog-ops.md](posthog-ops.md)
- [runbooks/oncall-runbook.md](runbooks/oncall-runbook.md)

## Historical / Reference

- [history/telemetry-gap-audit.md](history/telemetry-gap-audit.md)
- [dashboards/langfuse-dashboard.md](dashboards/langfuse-dashboard.md)
- [dashboards/posthog-dashboard.md](dashboards/posthog-dashboard.md)

## Selection Rules

- Start with the canonical contract for signal semantics.
- Start with the canonical playbook for a telemetry verification run. Treat it as a shared reusable checklist, then use local docs for exact field names and ownership hints.
- Open the local supplement when you need exact field names or ownership hints.
- Open historical docs only for background or prior rationale.
