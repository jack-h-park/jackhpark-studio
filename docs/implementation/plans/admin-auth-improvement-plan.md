# Admin Dashboard Authentication Improvement Plan

## Purpose

Assess whether the current Admin Dashboard access control adequately protects operational data and global Chat configuration, and define an approval-ready implementation plan.

This document records the plan and implementation status. It does not authorize production setting changes or deployment by itself.

## Implementation Status

Phase 1 and the Google OIDC migration are implemented in the current branch:

- Admin API handlers perform a defensive authentication check in addition to middleware protection.
- State-changing admin APIs reject cross-site fetches and mismatched origins when the relevant request headers are present.
- Focused authentication tests and the repository test suite pass.
- Google OIDC is enforced through Auth.js/NextAuth with a single allowlisted email.
- Local Google login, session-protected page access, and provider configuration have been verified with the configured OAuth client.
- The shared admin navigation now exposes a Google session sign-out control, and unauthenticated browser navigation returns to the branded sign-in page instead of opening a native Basic Auth prompt.
- The current implementation has been deployed to the Vercel production project; the production callback URL is now generated from `https://www.jackhpark.com`.
- Production Google login and logout have been verified by the administrator, including the production callback flow.
- Basic Auth has been removed from the application and production environment.
- State-changing administrator APIs now emit privacy-conscious `admin:mutation` events through the unified database logger with actor, action, logical target, result, and request ID.
- Production protection has been re-verified after the Basic Auth removal: unauthenticated pages redirect to `/admin/sign-in`, admin APIs return `401`, and Basic credentials are rejected.
- The administrator's Google account has 2-Step Verification enabled; application-level MFA is not required for the current single-administrator scope.
- Preview deployments are currently unused and are not treated as administrator entry points.

MFA policy, role model, rate limiting, and session-expiry validation remain pending operational configuration and validation.

### Google OIDC Pilot Decision

Google OIDC is selected as the first identity-provider pilot for the single-administrator deployment. The application-side integration and local login validation are complete.

**OIDC configuration used for end-to-end verification:**

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `ADMIN_GOOGLE_EMAIL`
- An exact Google Cloud Console callback registration for `/api/auth/callback/google`

Basic Auth has been removed from the application and production environment. Authenticated mutation execution has passed local build and static validation; session-expiry behavior and the remaining authorization controls still require operational validation.

**OIDC rollout result - 2026-08-23:** Google provider discovery, local login/logout, production callback handling, production login/logout, and the production Basic Auth retirement were verified.

### Phase 0 Findings - 2026-08-23

- The repository routes `chat.jackhpark.com` to `www.jackhpark.com/chat` through `vercel.json`.
- Live requests to `https://www.jackhpark.com/admin/ingestion`, `https://chat.jackhpark.com/admin/ingestion`, and `https://www.jackhpark.com/api/admin/chat-config` returned `401` with the Basic Auth challenge.
- The live responses were served through Cloudflare and Vercel, with HTTPS and HSTS observed.
- The repository contains no configured SSO/OIDC/MFA integration or documented preview-specific admin policy.
- The repository does not establish whether the administrator population is one operator or multiple users.

### Phase 0 Historical Open Decisions

- Confirm whether `www.jackhpark.com` and `chat.jackhpark.com` are both intended administrator entry points.
- Confirm whether the administrator population will remain one operator.
- Confirm whether Cloudflare Access is available for this domain and whether it can be the edge identity boundary.
- Confirm the required MFA level and whether a separate application-level role model is needed.
- Confirm the intended policy for Vercel preview deployments: disabled, owner-only, or identity-protected.

**Phase 0 status:** environment and live-boundary checks are complete. The current decisions are one Google OIDC administrator, Google account 2-Step Verification, and no Preview administrator entry point.

## Phase 0 Historical State and Decision

At the beginning of this assessment, `middleware.ts` protected both `/admin/:path*` and `/api/admin/:path*` with HTTP Basic Authentication. The starting state should therefore not be classified as unauthenticated.

The starting mechanism had the following characteristics:

- It relies on one static username and password (`ADMIN_DASH_USER`, `ADMIN_DASH_PASS`).
- It has no MFA, per-user accounts, role permissions, session expiry, or administrator-level audit trail.
- It protects changes to global Chat configuration, manual ingestion, document metadata, and ingestion-run deletion.
- It has no separate CSRF or Origin validation for state-changing requests.
- Malformed `Authorization` headers are not handled safely; local verification showed a `500` instead of a `401`.
- Individual API handlers rely on the middleware matcher rather than performing their own authentication and authorization checks.

**Decision:** Improvement is required for a publicly exposed production environment. The short-term priority is to harden the existing Basic Auth boundary and mutation requests. The medium-term priority is to replace the shared credential with user-based authentication that supports MFA.

The current implementation has completed that migration: Google OIDC is the only production administrator authentication path, with a single allowlisted email and server-side API authorization checks.

## Scope

### In scope

- Authentication for `/admin/*` pages
- Authentication for `/api/admin/*` APIs
- Authorization boundaries for administrator GET, POST, and DELETE operations
- CSRF and Origin validation
- Authentication-failure rate limiting and operational logging
- Regression verification after the authentication migration

### Out of scope

- General end-user authentication for the public Chat API
- A full Supabase data-model redesign
- Selecting an identity provider or registering administrator accounts
- Production deployment or password rotation in this planning phase

## Phased Execution Plan

### Phase 0 - Confirm Deployment Context and Threat Model

**Goal:** Confirm the assets, deployment conditions, and threats that the implementation must address.

**Questions to resolve:**

- What is the actual production domain, and is HTTPS enforced at every entry point?
- What is the intended admin access policy for Vercel preview and production environments?
- Is the administrator population one operator only, or will multiple administrators be supported?
- Which SSO providers are available, and is MFA mandatory?
- What audit requirements apply to administrator operations?
- Are administrator APIs intended to be callable only from the same origin?

**Completion criteria:**

- Decide whether the system is for one operator or multiple administrators.
- Decide the target authentication level, including whether MFA is mandatory.
- Decide the allowed access policy for production and preview environments.

**Gate 0:** Do not begin identity-provider or authorization-model implementation until these decisions are recorded.

### Phase 1 - Immediately Harden the Existing Basic Auth Boundary

**Goal:** Reduce clear errors and mutation risks without requiring an immediate authentication-provider migration.

**Planned work:**

- Safely validate the `Authorization` scheme and Base64 payload; return `401` for every malformed credential.
- Evaluate constant-time credential comparison.
- Add `Origin`/`Referer` validation and explicit CSRF protection for state-changing requests.
- Add a shared authentication and authorization helper for `/api/admin/*` mutations to reduce reliance on middleware matching alone.
- Apply authentication-failure rate limiting at the edge or WAF layer.
- Define audit events for authentication success/failure and administrator mutations.
- Verify HTTPS enforcement and whether the static administrator password has been reused elsewhere.

**Verification:**

- No credentials, incorrect credentials, and malformed credentials all return `401`.
- GET, POST, and DELETE admin endpoints are protected consistently.
- Requests from disallowed origins cannot perform mutations.
- Normal administrator requests and manual-ingestion SSE continue to work.
- Secrets do not appear in responses, logs, or URLs.

**Gate 1:** Do not deploy authentication-routing changes to production until Phase 1 verification passes.

### Phase 2 - Design the User-Based Authentication Migration

**Goal:** Replace the shared static password with user-based authentication and MFA.

**Candidates:**

- OIDC/SSO with an allowed-user or allowed-group list
- An external edge identity gateway such as Cloudflare Access
- Supabase Auth with session-based authentication and MFA

**Selection criteria:**

- MFA support
- Per-user revocation and session expiry
- Preview/production redirect and domain support
- Integration complexity with the current Next.js Pages Router application
- Ability to extend the role model
- Ability to connect authentication events to mutation audit logs

**Deliverables:**

- Selected provider and rationale
- Authentication, callback, and logout design
- User, role, and resource authorization matrix
- Environment-variable and secret-rotation plan
- Rollback procedure

**Gate 2:** Do not remove Basic Auth until the provider and authorization model have been approved.

### Phase 3 - Implement and Validate Incrementally

**Goal:** Validate the new authentication flow without interrupting existing administrator workflows.

**Planned work:**

- Implement a shared `requireAdmin` or equivalent server-side guard.
- Enforce authentication and authorization in both page SSR and API handlers.
- Separate read and mutation permissions.
- Keep Basic Auth as a restricted fallback or emergency access path for a limited transition period.
- Add login, logout, session-expiry, unauthorized, and forbidden states.
- Record actor, action, target, result, and request ID for administrator mutations.

**Verification:**

- Verify SSR responses for every admin page before and after authentication.
- Distinguish API `401` and `403` behavior.
- Verify the role allow/deny matrix.
- Verify session expiry and post-logout access denial.
- Verify manual-ingestion SSE connection and cancellation behavior.
- Verify document metadata updates and ingestion-run deletion permissions.

### Phase 4 - Complete the Migration and Validate the Production Policy

**Goal:** Confirm Google OIDC as the only production administrator authentication mechanism and complete operational hardening.

**Planned work:**

- Re-verify preview-environment access and bypass paths.
- Monitor authentication failures, forbidden responses, and mutation audit events.
- Update operational documentation and `.env.example`.

**Completion criteria:**

- All administrator workflows work with the new authentication mechanism.
- Only intended administrators can access the dashboard through Google OIDC.
- Unauthorized GET, POST, and DELETE requests are blocked.
- The system passes an operational validation period without requiring rollback.

## Initial Authorization Matrix

| Area | Operation | Minimum permission |
| --- | --- | --- |
| Ingestion | Health and run-list read access | `admin:read` |
| Ingestion | Manual ingestion | `admin:operate` |
| Documents | Document and metadata read access | `admin:read` |
| Documents | Metadata update | `admin:write` |
| Runs | Run deletion | `admin:operate` or `admin:destructive` |
| Chat Config | Global configuration read access | `admin:read` |
| Chat Config | Global configuration write access | `admin:write` |

Even if the initial deployment has only one administrator, roles should remain separable rather than being hard-coded to a single identity.

## Test Plan

- Middleware unit tests: valid credentials, missing credentials, invalid credentials, malformed headers, and missing environment variables
- API authentication tests for every `/api/admin/*` GET, POST, and DELETE route
- CSRF/Origin tests: same-origin success, cross-origin rejection, and the chosen missing-Origin policy
- Authorization tests for read, write, operate, and destructive boundaries
- Browser smoke tests: login, admin navigation, configuration save, ingestion execution, and document update
- Production-like preview tests: HTTPS, preview domain, and CDN/edge behavior
- Regression tests confirming that public pages and public Chat APIs remain unaffected

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Administrator downtime during migration | Validate fallback and rollback during Phase 3 |
| Policy mismatch between middleware and API guards | Maintain one route policy and shared test fixture |
| CSRF protection breaks SSE or browser workflows | Include the real administrator workflow in browser tests |
| Preview is weaker than production | Verify environment-specific access policies separately |
| Sensitive data enters audit logs | Record only actor, action, result, and request ID; exclude payloads and secrets |

## Recommended Execution Order

1. Complete Phase 0 and record the production domain, administrator count, MFA requirement, and preview policy.
2. Complete Phase 1, beginning with malformed-header handling and mutation protection.
3. Select the identity provider and authorization model after Gate 1.
4. Implement and validate the new authentication flow during Phase 3.
5. Complete production operational validation and retain a documented recovery procedure for the Google administrator account.

## Final Success Criteria

- Every administrator page and API requires user-based authentication and authorization.
- Authentication failures return clear `401` or `403` responses rather than exceptions or `500` responses.
- State-changing requests have CSRF/Origin protection.
- Administrator mutations are auditable by actor and result.
- MFA and session expiry match the operational policy.
- The existing Basic Auth credential is no longer a valid production access path.
