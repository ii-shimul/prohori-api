# Client integration release — API contract 1.0.0

**Status:** frozen for the final demo.  
**Authoritative contract:** [`../openapi.yaml`](../openapi.yaml) (`info.version: 1.0.0`).  
**Base URL:** `http://localhost:3000/api/v1` by default.

This release supports the web and mobile clients without exposing any financial-action capability. All records and identities are synthetic. The API provides review and coordination only.

## Client environment

### Web browser client

Configure the web client with a public API base URL:

```dotenv
NEXT_PUBLIC_PROHORI_API_URL=http://localhost:3000/api/v1
```

Run the web development server on a different port from the API (for example `3001`). On the API, allow that exact browser origin:

```dotenv
CORS_ORIGINS=http://localhost:3001
```

`CORS_ORIGINS` is a comma-separated allowlist. `CORS_ORIGIN` remains supported for a single origin; do not use `*`. Browser calls send `Authorization: Bearer <Supabase access token>` and may send a UUID `X-Correlation-Id`. The API returns that correlation ID on every response.

### Flutter/mobile client

Provide the same base URL through the app's normal build-time configuration. The correct host depends on the runtime:

| Runtime | API base URL |
| --- | --- |
| iOS simulator / desktop device | `http://localhost:3000/api/v1` |
| Android emulator | `http://10.0.2.2:3000/api/v1` |
| Physical device | `http://<LAN-host-ip>:3000/api/v1` |

Mobile clients do not require browser CORS. They still send the verified Supabase bearer access token. Never package `INGESTION_PROVIDER_*_KEY` values in a client application.

## Authentication and seed identities

1. Run `npm run db:reset` and `npm run prisma:generate` in `prohori-api`.
2. Create local Supabase Auth users outside source control whose JWT `sub` values match the seeded profile IDs.
3. Obtain access tokens from Supabase Auth and set the applicable client/test environment values.

The backend seed contains profile IDs and roles only; it intentionally does not provide credentials or passwords:

| Purpose | Seed profile ID |
| --- | --- |
| Provider A operations | `40000000-0000-4000-8000-000000000002` |
| Provider B operations | `40000000-0000-4000-8000-000000000003` |
| Demo administrator | `40000000-0000-4000-8000-000000000006` |
| Platform management | `40000000-0000-4000-8000-000000000007` |

The token must have the configured issuer/audience and `role=authenticated`. Provider/outlet authority comes from server-side memberships and assignments; clients cannot enlarge it with query or body IDs.

## Stable client flow

1. Call `GET /me` after sign-in and use its memberships, assignments, roles, locale, and scope version to configure the UI.
2. Use `GET /outlets`, then `GET /outlets/{id}/health` for the dashboard. Read balances/forecasts/anomalies/data quality only for the returned scoped outlets.
3. Read `GET /alerts` and alert detail for review workflows. Shared-cash alert evidence is intentionally redacted across providers.
4. For case commands, first read the current case and send both the current `version` and a unique `Idempotency-Key`. On replay the stored result is returned; on a stale version expect `CASE_VERSION_CONFLICT`.
5. Demo administrators may use `POST /simulation/reset`, `/start`, and `/step`. These controls are not regular client capabilities.

All non-health requests require bearer authentication. Error responses use the documented `{ code, correlationId, fieldErrors, message }` shape. Use the OpenAPI examples and schemas rather than inferring fields.

## Pair-test and final rehearsal

Start the API in one terminal after the database reset:

```bash
npm run db:reset
npm run prisma:generate
npm run build
npm run start:dev
```

In a second terminal, run the token-free backend-owned rehearsal:

```bash
npm run rehearsal:clean-reset
```

`rehearsal:clean-reset` performs the local reset, generation, build, automated unit/e2e security and scenario coverage, and the no-financial-action proof. It does not provision users, make token-backed client calls, or bypass authentication; normal client requests still require verified Supabase bearer JWTs and server-side scope enforcement.

## Freeze safeguards

- Do not make breaking route, field, enum, auth, scope, or error-shape changes under contract `1.0.0`.
- Treat only a reproduced client integration failure as a freeze exception. Record the failure, add focused regression coverage, rerun `npm run rehearsal:clean-reset`, and release a new contract version for a breaking change.
- Do not add SSE, Redis, BullMQ, background workers, real providers, financial actions, or additional detectors for the final demo.
- Keep all provider ingestion credentials and service configuration server-side.

## Evidence and known limits

The final checks are `npm run openapi:lint`, `npm run gate:no-financial-action`, and `npm run gate:final-freeze`. The final freeze gate runs automated unit/e2e coverage for security and scenario behavior without named access-token environment variables.

Passing local checks demonstrates a deterministic synthetic prototype only. It is not a production-readiness claim and does not replace hosted Supabase/Auth verification, production CORS configuration, threat modeling, monitoring, load testing, or a security review.
