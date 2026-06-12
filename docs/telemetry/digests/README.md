# Telemetry digests

Auto-populated by the `weekly-telemetry-digest` scheduled routine (every Monday). Each `YYYY-MM-DD.md` file is one week's report: a deterministic Langfuse digest plus an interpretive "Weekly Takeaways" section.

Generate one manually any time:

```bash
pnpm telemetry:digest --days 7 --out docs/telemetry/digests/$(date +%F).md
```

See [../weekly-digest.md](../weekly-digest.md) for what the numbers mean.
