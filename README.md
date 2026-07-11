# Prohori API

NestJS + Fastify backend for synthetic provider-liquidity, unusual-activity review, data-quality, and case-coordination demos.

## Safety boundary

Decision support only. Synthetic data only. Never initiate a transfer, refill, settlement, wallet action, financial reversal, freeze, block, or fraud verdict.

## Requirements

- Node.js 22+
- npm
- Docker Desktop/Engine

## Setup

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run start:dev
```

Check process liveness:

```bash
curl -i http://localhost:3000/api/v1/health/live
```

Every HTTP response includes `X-Correlation-Id`. Valid client UUID values are echoed; invalid/missing values are replaced.

## Local database

Supabase owns schema and seed data. Prisma is query-only and must not create migrations or use `prisma db push`.

```bash
npx supabase start
npm run db:reset
```

`db:reset` applies `supabase/migrations/` then deterministic synthetic `supabase/seed.sql`. The private `app` schema is excluded from Supabase Data API exposure; direct `anon` and `authenticated` domain access is revoked.

The clean baseline seeds scope/catalog data, 6 shared-cash balances, 18 outlet/provider e-money balances and matching simulation baselines, 3 healthy provider feed batches, 36 settled normal ledger events, 24 matching snapshots, and 6 healthy forecast runs with 96 points. It intentionally seeds **no** quality incidents, anomaly signals/correlations, alerts, cases, audit records, or command idempotency history; scenarios and workflow actions create those records. The three healthy feed batches make the redacted management-readiness projection report all providers as reporting with zero degraded/unreliable providers and zero active incidents.

Run `npm run seed:check` for static seed-shape checks. `supabase db reset --local` also executes SQL assertions for the synthetic baseline’s row counts, balance/snapshot coherence, and healthy feed/forecast data.

### Applying the synthetic baseline to Supabase Cloud

After linking this directory to the intended project, use this non-destructive command:

```bash
npx supabase db push --linked --include-seed
```

It applies pending migrations and re-applies `supabase/seed.sql`; it **does not** reset the cloud database. The seed upserts the three baseline provider/area/outlet codes without replacing their existing UUIDs, then resolves those IDs before inserting FK-dependent data. It updates only the deterministic synthetic baseline rows and leaves manually created catalog records plus incident, alert, case, audit, and idempotency history intact. Do **not** use `supabase db reset` against Cloud for this purpose.

Current schema also includes provider-scoped cases, alert links, append-only case events/notes, immutable audit events, command idempotency records, and the Step 10 fixed redacted `platform_readiness_aggregates` projection. `SUPABASE_URL` is distinct from Prisma's `DATABASE_URL`.

For a clean local rehearsal, run `npm run db:reset`, then `npm run prisma:generate`. Reset only creates synthetic records; it does not create Supabase Auth users or passwords.

## Commands

```bash
npm run format:check
npm run lint
npm run openapi:lint
npm run prisma:generate
npm run build
npm run test
npm run test:e2e
npm run db:reset
npm run seed:check
npm run gate:no-financial-action
```

## Step 11 clean-reset, security, and scenario gates

The final gate has no access-token setup. It runs the automated unit/e2e coverage and the static no-financial-action proof:

```bash
npm run gate:step-11
```

The unit suite proves deterministic A–D scenario fixtures, simulation authorization, provider/outlet scope enforcement, workflow audit behavior, and quality safeguards such as unreliable-data ETA suppression. The e2e suite proves CORS preflight and that protected API routes reject missing bearer JWTs. `gate:no-financial-action` checks the OpenAPI POST allowlist and verifies that alert/case source does not reference transaction or balance models. Normal routes remain protected by verified Supabase JWTs, server-side scope checks, and RLS.

## Step 12 final integration and freeze

The final client release is documented in [`docs/client-integration-release.md`](./docs/client-integration-release.md). It contains the frozen 1.0.0 contract, exact web/mobile base-URL setup, seed identities (without credentials), authentication/scope rules, request flow, pair-test variables, clean-reset rehearsal, and freeze exceptions.

Run the final evidence suite without access-token setup:

```bash
npm run rehearsal:clean-reset
```

`rehearsal:clean-reset` resets the local database, generates Prisma, builds the API, and runs the automated Step 11/final gate. That gate runs unit/e2e coverage for security and deterministic scenarios plus the no-financial-action proof. It does not provision users or bypass authentication; protected-route JWT and authorization behavior remains covered by automated tests.

## Provider ingestion and deterministic simulation

Provider feeds use `POST /api/v1/ingestion/providers/{provider}/batches` with `X-Provider-Ingest-Key`. The key determines the provider scope; it must match the `{provider}` path and is never accepted from a request body. Set a distinct `INGESTION_PROVIDER_A_KEY`, `INGESTION_PROVIDER_B_KEY`, and `INGESTION_PROVIDER_C_KEY` in your local environment. Do not expose these credentials to browser clients.

A batch includes integer `amountMinor` values, source/received timestamps, sequential batch number, events, optional balance snapshots, and a SHA-256 checksum. The checksum is calculated over recursively key-sorted JSON for the body excluding `checksum`. Accepted duplicates are retained as `DUPLICATE_OR_REPLAYED_EVENT` quality evidence and never alter balances twice. Sequence gaps, out-of-order input, lag, incomplete payloads, invalid scope/timestamps, balance mismatch, and conflicting snapshots produce visible quality incidents or a safe rejection.

Demo administrators (verified JWT user with `DEMO_ADMIN`) can run deterministic controls:

```bash
curl -X POST http://localhost:3000/api/v1/simulation/reset -H "Authorization: Bearer <admin-jwt>"
curl -X POST http://localhost:3000/api/v1/simulation/start -H "Authorization: Bearer <admin-jwt>" -H 'Content-Type: application/json' -d '{"scenario":"A"}'
curl -X POST http://localhost:3000/api/v1/simulation/step -H "Authorization: Bearer <admin-jwt>" -H 'Content-Type: application/json' -d '{"scenario":"A"}'
```

`reset` restores seeded baseline balances and removes only simulated feed receipts, ledger events, snapshots, and quality incidents. `start` resets then submits a fixture through the same ingestion service; `step` submits the next deterministic fixture. These controls require a verified `DEMO_ADMIN` Supabase JWT when called over HTTP. Scenarios A–D are synthetic only; scenario C intentionally produces freshness and snapshot-quality evidence.

## Balance semantics

Amounts use integer BDT minor units. Settled `CASH_IN` increases shared physical cash and decreases that provider's e-money. Settled `CASH_OUT` decreases shared cash and increases that provider's e-money. Pending, failed, and reversed events do not apply a new balance effect in this stage. Shared cash and provider e-money are never combined.

## API contract

[`openapi.yaml`](./openapi.yaml) is authoritative. Base URL: `http://localhost:3000/api/v1`.

Current routes:

- `GET /health/live` — process liveness check.
- `GET /me`
- `GET /providers`
- `GET /areas`
- `GET /outlets?areaCode=DHAKA_NORTH`
- `POST /ingestion/providers/{provider}/batches`
- `GET /outlets/{id}/health` — scoped liquidity-health summary; creates a deterministic forecast run.
- `GET /outlets/{id}/balances` — separate shared cash and authorized provider e-money positions.
- `GET /outlets/{id}/forecasts` — persisted 30/60/120/240-minute bounded projections.
- `GET /outlets/{id}/transactions?limit=50&cursor={uuid}` — scoped provider ledger events.
- `GET /outlets/{id}/anomalies` — persisted repeated-amount and velocity review signals with source references, baseline, threshold, score, quality/confidence, benign-context explanation, and any non-causal liquidity correlation.
- `GET /outlets/{id}/data-quality` — scoped active quality incidents behind analytics outputs.
- `GET /feed-health?providerId={uuid}&outletId={uuid}&limit=50&cursor={uuid}` — provider-scoped feed freshness and derived quality; filters only narrow scope.
- `GET /data-quality/incidents?providerId={uuid}&outletId={uuid}&limit=50&cursor={uuid}` — RLS-scoped quality evidence.
- `GET /management/readiness` — fixed redacted aggregate for `PLATFORM_MANAGEMENT` or `DEMO_ADMIN`; never exposes a provider/outlet/ledger row.
- `GET /alerts?active=true&outletId={uuid}&type={alert-type}` — routed review-only alert episodes.
- `GET /alerts/{id}` — scoped alert plus immutable evidence snapshots.
- `POST /alerts/{id}/acknowledge`, `POST /alerts/{id}/assign`, `POST /alerts/{id}/create-case` — require `Idempotency-Key`; workflow-only and never mutate balances or transactions.
- `GET /cases`, `GET /cases/{id}`, `GET /cases/{id}/timeline` — provider-scoped case views; timeline contains append-only events, notes, and audit records.
- `POST /cases/{id}/acknowledge`, `/assign`, `/notes`, `/request-verification`, `/escalate`, `/disposition`, `/resolve`, `/close`, `/reopen` — require `Idempotency-Key` and body `version`; all are review-only commands.
- `POST /simulation/reset`, `POST /simulation/start`, `POST /simulation/step` (DEMO_ADMIN only)

All catalog, analytics, feed-health, data-quality, alert, case, and management routes require a verified Supabase JWT. Server-side membership, outlet assignment, alert routing, and RLS determine visibility; provider/outlet query filters only narrow that visibility. A missing or invalid token returns the standard safe `401` error.

## Deterministic liquidity forecasts

Forecast reads require a verified JWT and an active outlet assignment. Provider e-money is additionally filtered by the caller's active provider membership; shared physical cash stays a separate resource. No endpoint calculates or returns a combined balance, financial-action command, or financial-action recommendation.

Each `/outlets/{id}/forecasts` request creates a `forecast_runs` record containing the input evidence snapshot and JSON output, plus four `forecast_points` per visible resource (30, 60, 120, and 240 minutes). The projection is a pure TypeScript rolling settled-flow calculation: `CASH_OUT` consumes shared cash and `CASH_IN` consumes only that provider's e-money. Bounds are derived deterministically from the observed flow variation.

`modelConfidence` is an analytical history-coverage value and is intentionally distinct from feed `dataQuality`. Active freshness/sequence issues mark results `degraded`; conflicting snapshots, balance mismatches, or out-of-order feeds mark them `unreliable`. Unreliable outputs retain their confidence and bounded amounts but set `reserveEtaMinutes` and `likelyDepletionEtaMinutes` to `null`.

Normal forecast request:

```bash
curl -H "Authorization: Bearer <access-token>" \
  http://localhost:3000/api/v1/outlets/30000000-0000-4000-8000-000000000001/forecasts
```

For a normal feed, points include ETAs. After scenario C creates delayed/conflicting feed evidence, the same route returns `dataQuality: "unreliable"` and exact ETA fields are `null`; it does not make a replenishment or transfer recommendation. See [`openapi.yaml`](./openapi.yaml) for both complete response examples.

## Unusual-activity review signals

`GET /outlets/{id}/anomalies` creates deterministic, persisted signals from settled outlet/provider transactions in a 60-minute evidence window and a preceding seeded-history baseline. Repeated/near-identical amount clusters trigger at three events above baseline; velocity triggers at four events or three times the six-bucket baseline. Each signal includes the detector version, observed and baseline values, threshold, normalized score, source transaction IDs, evidence window, possible benign explanation, analytical confidence, and propagated data quality.

Scenario B submits four same-amount `CASH_OUT` events through the normal ingestion path. This produces separate shared-cash liquidity pressure and unusual-activity signals. A correlation is persisted only when both meet the fixed `0.75` threshold; its context explicitly states that coincidence in the evidence window does not establish causation. All responses say **“Unusual activity requires review.”** They never label activity as fraud or make a verdict.

## Alerts and safe localization

Forecasts, unusual-activity signals, quality incidents, and correlations create/update stable alert episodes. The fingerprint is `type + outlet + provider/resource + hourly evidence window`; repeated observations update the active episode instead of producing duplicate alerts. Provider e-money and unusual-activity alerts are routed only to active memberships with an active assignment at the outlet. Shared-cash alerts route at outlet level and expose `providerId: null` plus redacted evidence, so a recipient cannot see competitor provider projections.

Alert text is delivered as stable message keys and parameters, not a hard-coded imperative. Clients should localize the keys in English/Bengali (for example, `alerts.shared_cash_pressure.review` and `alerts.unusual_activity_review.review`) and retain review-only wording. The API does not prescribe refills, transfers, freezes, blocks, or fraud outcomes.

## Cases and audit timeline

`POST /alerts/{id}/create-case` now atomically creates the scoped case, alert link, initial case event, and audit event. Cases transition only through `OPEN → ACKNOWLEDGED → INVESTIGATING → ESCALATED → RESOLVED → CLOSED`; `INVESTIGATING → RESOLVED` is also allowed. Reopening a closed case returns it to `OPEN` and clears its prior resolution. Resolution codes are allowlisted and require a summary.

Every case command requires a caller-owned `Idempotency-Key` and the current optimistic `version`. A replay returns its stored response; a stale version gets `CASE_VERSION_CONFLICT`. Case events, notes, and audit events are append-only at the database level. Each mutation records actor, action, provider/outlet scope, old/new state where relevant, wall/simulated time, correlation ID, and safe metadata. Workflow modules never query or update `transactions`, `outlet_cash_balances`, or `provider_balances`.

## Contract freeze — 1.0.0

[`openapi.yaml`](./openapi.yaml) version **1.0.0** is the frozen client contract for web and mobile. It documents every demo route, bearer or ingestion authentication, scope/role behavior, pagination, idempotency headers, and standard errors. Do not make breaking field, route, or enum changes without an integration blocker and a new contract version.

### Prototype limitations

- All records, identities, and scenarios are synthetic; no real provider, wallet, or customer data is supported.
- Forecasts are deterministic bounded projections, not production forecasting or a financial recommendation.
- The API has no automatic financial action and no public transfer, refill, settlement, reversal, freeze, block, or fraud-verdict command.
- Passing local gates is not a production-readiness claim. Hosted Supabase/Auth configuration, operational monitoring, threat modeling, load testing, and production security review remain required.

### Demo identities and roles

The seed supplies synthetic profile IDs only; create matching local Supabase Auth users/tokens outside source control. It never stores passwords. `40000000-0000-4000-8000-000000000006` is `DEMO_ADMIN`; `40000000-0000-4000-8000-000000000007` is `PLATFORM_MANAGEMENT`. Provider A and B operations identities are IDs ending `...002` and `...003`. The JWT `sub` must match the seeded profile ID.

### Client request examples

```bash
# Scoped feed/data-quality reads
curl -H "Authorization: Bearer <access-token>" \
  'http://localhost:3000/api/v1/feed-health?limit=50'
curl -H "Authorization: Bearer <access-token>" \
  'http://localhost:3000/api/v1/data-quality/incidents?outletId=30000000-0000-4000-8000-000000000001'

# Redacted aggregate; management/admin token required
curl -H "Authorization: Bearer <management-access-token>" \
  http://localhost:3000/api/v1/management/readiness
```

Workflow mutations remain replay-safe: send a unique `Idempotency-Key` and the current case `version`. Reads do not use idempotency keys.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime environment: `development`, `test`, or `production` |
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_URL` | local Supabase Postgres | Prisma PostgreSQL connection string |
| `SUPABASE_URL` | none until Step 3 | Hosted Supabase project URL for Auth/JWKS; not a database URL |
| `CORS_ORIGIN` | `http://localhost:3000` | Backward-compatible single explicit browser origin; wildcard rejected |
| `CORS_ORIGINS` | none | Optional comma-separated explicit browser-origin allowlist; overrides `CORS_ORIGIN` |
| `LOG_LEVEL` | `log` | Nest logger level |
| `INGESTION_PROVIDER_A_KEY` | none | Provider A server-to-server ingestion credential |
| `INGESTION_PROVIDER_B_KEY` | none | Provider B server-to-server ingestion credential |
| `INGESTION_PROVIDER_C_KEY` | none | Provider C server-to-server ingestion credential |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` | Required JWT audience |
| `SUPABASE_JWT_ISSUER` | derived from `SUPABASE_URL` when set | Expected JWT issuer |
