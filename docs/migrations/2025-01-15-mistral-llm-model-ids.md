# Migrate `admin_chat_config` LLM IDs from `mistral` to `mistral-ollama`

The admin UI and runtime now expect explicit backend-specific model IDs
for Mistral. Before rolling out this release, make sure the `admin_chat_config`
JSON no longer references the ambiguous `"mistral"` ID.

The following SQL is a one-time Postgres migration you can run against the
`system_settings` table to rewrite every occurrence of `"mistral"` in that
row to `"mistral-ollama"`. Adjust the paths (`presets`/`allowlist`) if you
have other keys that still reference the legacy ID.

```sql
-- 1) Inspect the current row
SELECT key, value
FROM system_settings
WHERE key = 'admin_chat_config';

-- 2) Update preset references (add/remove paths as needed)
UPDATE system_settings
SET value = jsonb_set(
  jsonb_set(
    value,
    '{presets,default,llmModel}',
    to_jsonb('mistral-ollama'::text),
    true
  ),
  '{presets,local-required,llmModel}',
  to_jsonb('mistral-ollama'::text),
  true
)
WHERE key = 'admin_chat_config';

-- 3) Replace allowlist entries
UPDATE system_settings
SET value = jsonb_set(
  value,
  '{allowlist,llmModels}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem = to_jsonb('mistral'::text)
          THEN to_jsonb('mistral-ollama'::text)
        ELSE elem
      END
    )
    FROM jsonb_array_elements(value->'allowlist'->'llmModels') AS elem
  ),
  true
)
WHERE key = 'admin_chat_config';

-- 4) Verify the migration
SELECT key, value
FROM system_settings
WHERE key = 'admin_chat_config';
```

If you have additional presets (beyond `default`, `local-required`, etc.)
or custom allowlist entries, update the JSON paths above accordingly before
running the script.
