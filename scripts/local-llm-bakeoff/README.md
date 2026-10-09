# Local LLM Bake-off

Measures candidate local models on frozen JackGPT inputs. Design:
[docs/superpowers/specs/2026-09-26-studio-local-llm-design.md](../../docs/superpowers/specs/2026-09-26-studio-local-llm-design.md).

## Environment

| Variable             | Meaning                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `BAKEOFF_DATA_DIR`   | Private directory **outside this repo** for questions, fixtures, results, scores and reports |
| `BAKEOFF_HOST`       | ssh alias of the model host                                                                  |
| `BAKEOFF_HOST_DIR`   | Working directory on the host                                                                |
| `BAKEOFF_NODE`       | Absolute path of Node 22 on the host                                                         |
| `LMSTUDIO_API_TOKEN` | Only if the host's LM Studio requires a token                                                |

## 1. Record the fixture (laptop, any time)

Before the reference pass, confirm in the admin dashboard (Chat Config → Session presets) that the default preset's live model is gpt-6-luna — database rows override code defaults; if it is different, the reference rows would be mislabeled.

```bash
node scripts/local-llm-bakeoff/recorder.mjs --port 18080 --log "$BAKEOFF_DATA_DIR/recorder-log.jsonl"
```

In a second terminal, start the dev app pointed at the recorder, with chat notifications off:

```bash
LMSTUDIO_BASE_URL=http://127.0.0.1:18080/v1 TELEGRAM_BOT_TOKEN= TELEGRAM_CHAT_ID= pnpm dev
```

Then, in a third terminal:

```bash
pnpm exec tsx scripts/local-llm-bakeoff/record-fixture.ts --pass local --questions "$BAKEOFF_DATA_DIR/questions.json" --out-dir "$BAKEOFF_DATA_DIR" --recorder-log "$BAKEOFF_DATA_DIR/recorder-log.jsonl"
pnpm exec tsx scripts/local-llm-bakeoff/record-fixture.ts --pass reference --questions "$BAKEOFF_DATA_DIR/questions.json" --out-dir "$BAKEOFF_DATA_DIR"
```

Restart both servers before recording again. The dev app keeps an in-memory response cache, so a question it has already answered never reaches the recorder, and the local pass then stops with `no streamed request recorded`. On a fresh dev app the first chat request can time out while it compiles; send a throwaway question first, not one from the set.

The recorder.mjs script truncates its `--log` file on startup and refuses a `--log` path inside the repo; record-fixture.ts refuses `--out-dir` and `--recorder-log` inside the repo.

The recorder answers every call with a stub, so the local pass refuses to build a fixture when the app made any model call besides the streamed answer (query rewrite, HyDE or history summary) and names those items: their recorded input would have been built from the stub. Turn those features off for the recording session or record those items another way.

## 2. Stage on the host

```bash
ssh "$BAKEOFF_HOST" "mkdir -p $BAKEOFF_HOST_DIR"
scp scripts/local-llm-bakeoff/*.mjs scripts/local-llm-bakeoff/manifest.json "$BAKEOFF_DATA_DIR/fixture.json" "$BAKEOFF_HOST:$BAKEOFF_HOST_DIR/"
ssh "$BAKEOFF_HOST" "cd $BAKEOFF_HOST_DIR && $BAKEOFF_NODE run-bakeoff.mjs --mode preflight --manifest manifest.json"
```

## 3. Run overnight (host, inside the agreed window)

```bash
ssh "$BAKEOFF_HOST" "cd $BAKEOFF_HOST_DIR && nohup caffeinate -i $BAKEOFF_NODE run-bakeoff.mjs --mode run --manifest manifest.json --fixture fixture.json --start-at 01:30 >> run.log 2>&1 &"
```

The log is appended to, so a rerun keeps the earlier night's lines. If the process dies, rerun the same command: finished rows are skipped. A resume must also run inside an agreed window: drop `--start-at` only when you are inside one now, otherwise keep a `--start-at` for the next one. If it was killed hard, put the server back first:

```bash
ssh "$BAKEOFF_HOST" "cd $BAKEOFF_HOST_DIR && $BAKEOFF_NODE run-bakeoff.mjs --mode restore --manifest manifest.json --state state.json"
```

A run reuses an existing `state.json` whose snapshot has no `restoredAt` instead of overwriting it, and stamps `restoredAt` after a successful restore; `--mode restore` also stamps it, and refuses a state file that already has `restoredAt` (the server may have been changed on purpose since) unless you add `--force`. The script aborts a variant after 3 consecutive failed requests without recording them (so a resume re-measures it), and every request has a 5-minute timeout (a model load 15 minutes, any other LM Studio admin call 1 minute). A restore tries every snapshot model, retrying each failed load once, and names every model it could not reload. It replays each model's load settings, including its slot count (`parallel`), then reads them back and reports any setting the server did not apply. The last log line, `incomplete variants: ...`, lists the variants a resume still has to measure.

The run follows the host's experiment stop rule: it refuses to start while free+inactive memory is under 12 GiB, and ends early (restoring the snapshot) if free+inactive drops under 12 GiB or swap grows by more than 1 GiB since the start. The log then shows `stop rule tripped: ...`, and a resume in a later window continues from there.

## 4. Score and report (laptop)

```bash
scp "$BAKEOFF_HOST:$BAKEOFF_HOST_DIR/results.jsonl" "$BAKEOFF_HOST:$BAKEOFF_HOST_DIR/run.log" "$BAKEOFF_HOST:$BAKEOFF_HOST_DIR/state.json" "$BAKEOFF_DATA_DIR/"
node --import=tsx --env-file=.env.local scripts/local-llm-bakeoff/score.ts --fixture "$BAKEOFF_DATA_DIR/fixture.json" --results "$BAKEOFF_DATA_DIR/results.jsonl" --results "$BAKEOFF_DATA_DIR/reference-results.jsonl" --out "$BAKEOFF_DATA_DIR/scores.jsonl"
```

The first run prints the estimated judge cost and a worst-case bound; rerun with `--yes` once it is approved. It refuses to start when the results hold answers for items the fixture does not have. Rerunning `score.ts` judges only what is missing: rows with a verdict or a judge refusal are kept, and every other judge error is retried (the report uses the newest row per variant and item).

Review every flagged item and record the verdicts in `$BAKEOFF_DATA_DIR/reviews.json`, one entry per reviewed variant and item:

```json
{
  "reviews": [
    { "variant": "...", "itemId": "...", "confirmedUngrounded": true }
  ]
}
```

`confirmedUngrounded: true` fails the variant's groundedness criterion; `false` clears the flag; a flagged item with no entry keeps the variant at `pending-review`. Then:

```bash
pnpm exec tsx scripts/local-llm-bakeoff/report.ts --fixture "$BAKEOFF_DATA_DIR/fixture.json" --results "$BAKEOFF_DATA_DIR/results.jsonl" --results "$BAKEOFF_DATA_DIR/reference-results.jsonl" --scores "$BAKEOFF_DATA_DIR/scores.jsonl" --reviews "$BAKEOFF_DATA_DIR/reviews.json" --out "$BAKEOFF_DATA_DIR/report.md"
```

A variant missing a baseline row or a valid score for any fixture item fails the `coverage` criterion; the Coverage column shows how many items it has.
