# Telemetry digests

Auto-populated every Monday by the Hermes `telemetry-digest` cron job (ops profile, on
the iMac), which runs `telemetry:digest`, has the model interpret the result, and commits
the file in the same run. Each `YYYY-MM-DD.md` is one week's report: an interpretive
"Weekly Takeaways" section followed by the deterministic digest verbatim.

The numbers in the takeaways are checked back against the digest — and against the
previous week's report, which the job supplies so trend claims have a source. A number
that appears in neither costs the whole interpretive section, and the file falls back to
the deterministic `## Takeaways` the script itself prints.

Job definition and operating notes:
[`hermes-control-plane/docs/hermes/cron-jobs.md`](https://github.com/jack-h-park/jackhpark-hermes-control-plane/blob/main/docs/hermes/cron-jobs.md)
(§ `telemetry-digest`).

Generate one manually any time:

```bash
pnpm telemetry:digest --days 7 --out docs/telemetry/digests/$(date +%F).md
```

See [../weekly-digest.md](../weekly-digest.md) for what the numbers mean.
