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
ssh "$BAKEOFF_HOST" "cd $BAKEOFF_HOST_DIR && nohup caffeinate -i $BAKEOFF_NODE run-bakeoff.mjs --mode run --manifest manifest.json --fixture fixture.json --start-at 01:30 > run.log 2>&1 &"
```

If the process dies, rerun the same command without `--start-at`: finished rows are skipped. If it was killed hard, put the server back first:

```bash
ssh "$BAKEOFF_HOST" "cd $BAKEOFF_HOST_DIR && $BAKEOFF_NODE run-bakeoff.mjs --mode restore --manifest manifest.json --state state.json"
```

A run reuses an existing `state.json` whose snapshot has no `restoredAt` instead of overwriting it, and stamps `restoredAt` after a successful restore; `--mode restore` also stamps it, and refuses a state file that already has `restoredAt` (the server may have been changed on purpose since) unless you add `--force`. The script aborts a variant after 3 consecutive failed requests without recording them (so a resume re-measures it), and every request has a 5-minute timeout.

## 4. Score and report (laptop)

```bash
scp "$BAKEOFF_HOST:$BAKEOFF_HOST_DIR/{results.jsonl,run.log,state.json}" "$BAKEOFF_DATA_DIR/"
node --import=tsx --env-file=.env.local scripts/local-llm-bakeoff/score.ts --fixture "$BAKEOFF_DATA_DIR/fixture.json" --results "$BAKEOFF_DATA_DIR/results.jsonl" --results "$BAKEOFF_DATA_DIR/reference-results.jsonl" --out "$BAKEOFF_DATA_DIR/scores.jsonl"
```

The first run prints the estimated judge cost; rerun with `--yes` once it is approved. Review every flagged item and record the verdicts in `$BAKEOFF_DATA_DIR/reviews.json`, then:

```bash
pnpm exec tsx scripts/local-llm-bakeoff/report.ts --results "$BAKEOFF_DATA_DIR/results.jsonl" --results "$BAKEOFF_DATA_DIR/reference-results.jsonl" --scores "$BAKEOFF_DATA_DIR/scores.jsonl" --reviews "$BAKEOFF_DATA_DIR/reviews.json" --out "$BAKEOFF_DATA_DIR/report.md"
```
