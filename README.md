# Prohori API

NestJS + Fastify backend for synthetic provider-liquidity, unusual-activity review, data-quality, and case-coordination demos.

## Safety boundary

This API is decision support only. It uses synthetic data and must never initiate a transfer, refill, settlement, wallet action, financial reversal, freeze, block, or fraud verdict.

## Requirements

- Node.js 22+
- npm

Supabase setup, database migrations, synthetic seed data, and scenario reset arrive in later implementation steps.

## Setup

```bash
cp .env.example .env
npm install
npm run start:dev
```

Check process liveness:

```bash
curl -i http://localhost:3000/api/v1/health/live
```

Expected body:

```json
{
  "service": "prohori-api",
  "status": "ok"
}
```

Every HTTP response includes `X-Correlation-Id`. Send a valid UUID in that header to retain it across logs and error responses.

## Commands

```bash
npm run build
npm run lint
npm run format:check
npm run test
npm run test:e2e
npm run openapi:lint
```

`npm run db:reset` and `npm run scenario:reset` intentionally fail with clear messages until their migrations/fixtures are implemented in later steps.

## API contract

[`openapi.yaml`](./openapi.yaml) is authoritative. Base URL: `http://localhost:3000/api/v1`.

Current endpoint:

- `GET /health/live` — unauthenticated process liveness check.

All domain endpoints added later require a verified Supabase bearer token and provider/outlet scope enforcement.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime environment: `development`, `test`, or `production` |
| `PORT` | `3000` | HTTP listen port |
| `CORS_ORIGIN` | `http://localhost:3000` | Explicit browser origin; wildcard is rejected |
| `LOG_LEVEL` | `log` | Nest logger level |
