# Vercel Runtime Debug Endpoints (Temporary)

These temporary API routes help diagnose Vercel production runtime differences for `/admin/documents`, especially `ERR_REQUIRE_ESM` failures involving `jsdom` and `parse5`.

## Why These Exist

- Confirm the actual Node runtime version and Vercel runtime metadata in production.
- Force a minimal `jsdom` parse in the deployed runtime to reproduce the same import/parse failure path (if present).

## Security Gate

- Both endpoints require `DEBUG_API_SECRET`.
- Provide the secret with either:
- Query param: `?secret=...`
- Header: `x-debug-secret: ...`
- If the secret is missing or invalid, the endpoint returns `404`.

## Endpoints

- `GET /api/_debug/runtime`
- `GET /api/_debug/jsdom-smoke`

## Example Calls

```bash
curl -sS "https://<domain>/api/_debug/runtime?secret=YOUR_SECRET"
curl -sS "https://<domain>/api/_debug/jsdom-smoke?secret=YOUR_SECRET"
```

Header-based alternative:

```bash
curl -sS -H "x-debug-secret: YOUR_SECRET" "https://<domain>/api/_debug/runtime"
curl -sS -H "x-debug-secret: YOUR_SECRET" "https://<domain>/api/_debug/jsdom-smoke"
```

## Cleanup

Delete these endpoints and remove the `DEBUG_API_SECRET` configuration after the production diagnosis is complete.
