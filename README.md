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

Current schema: providers, areas, outlets, profiles, provider memberships, and outlet assignments. JWT/RLS authorization arrives in Step 3. Set `SUPABASE_URL` to the hosted project URL before starting Step 3; it is distinct from Prisma's `DATABASE_URL`.

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
```

`npm run scenario:reset` intentionally fails until Step 5 provides simulator fixtures.

## API contract

[`openapi.yaml`](./openapi.yaml) is authoritative. Base URL: `http://localhost:3000/api/v1`.

Current routes:

- `GET /health/live` — process liveness check.
- `GET /me`
- `GET /providers`
- `GET /areas`
- `GET /outlets?areaCode=DHAKA_NORTH`

Catalog routes exist in contract but return `503 AUTH_NOT_CONFIGURED` until Step 3 adds verified Supabase JWT authentication and scope enforcement. They are never temporarily public.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime environment: `development`, `test`, or `production` |
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_URL` | local Supabase Postgres | Prisma PostgreSQL connection string |
| `SUPABASE_URL` | none until Step 3 | Hosted Supabase project URL for Auth/JWKS; not a database URL |
| `CORS_ORIGIN` | `http://localhost:3000` | Explicit browser origin; wildcard rejected |
| `LOG_LEVEL` | `log` | Nest logger level |
