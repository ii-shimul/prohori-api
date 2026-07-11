import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const seedPath = resolve(import.meta.dirname, '../supabase/seed.sql');
const seed = readFileSync(seedPath, 'utf8').toLowerCase();
const requiredTables = [
  'providers',
  'areas',
  'outlets',
  'profiles',
  'provider_memberships',
  'outlet_assignments',
  'outlet_cash_balances',
  'provider_balances',
  'simulation_balance_baselines',
  'simulation_state',
  'feed_batches',
  'transactions',
  'balance_snapshots',
  'forecast_runs',
  'forecast_points',
];
const upsertedTables = [
  'providers',
  'areas',
  'outlets',
  'profiles',
  'provider_memberships',
  'outlet_cash_balances',
  'provider_balances',
  'simulation_balance_baselines',
  'simulation_state',
  'feed_batches',
  'transactions',
  'balance_snapshots',
  'forecast_runs',
  'forecast_points',
];
const forbiddenHistoryTables = [
  'data_quality_incidents',
  'anomaly_signals',
  'liquidity_anomaly_correlations',
  'alerts',
  'alert_evidence_snapshots',
  'alert_routes',
  'alert_case_requests',
  'alert_action_idempotency',
  'cases',
  'case_alert_links',
  'case_events',
  'case_notes',
  'audit_events',
  'case_command_idempotency',
];

const failures = [];

// Cloud seed execution may put every statement in a different database session.
// Reject session-local or cross-statement helper relations instead of attempting
// to verify their lifetime or cleanup.
for (const [pattern, message] of [
  [/\bcreate\s+(?:local\s+|global\s+)?temp(?:orary)?\s+(?:table|view)\b/, 'seed must not create temporary relations'],
  [/\bcreate\s+unlogged\s+table\b/, 'seed must not create unlogged helper tables'],
  [/\b(?:create|alter|drop|truncate)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?(?:[a-z0-9_]+\.)?seed_[a-z0-9_]+\b/, 'seed must not manage cross-statement seed helper tables'],
  [/\bseed_[a-z0-9_]+\b/, 'seed must not reference seed_* helper relations'],
]) {
  if (pattern.test(seed)) failures.push(message);
}

for (const table of requiredTables) {
  const insert = new RegExp(`insert\\s+into\\s+app\\.${table}\\b`);
  if (!insert.test(seed)) {
    failures.push(`missing seeded ${table}`);
    continue;
  }

  const selfContainedValuesCte = new RegExp(
    `with\\s+input\\s*\\([^;]+?\\)\\s+as\\s*\\(\\s*values[\\s\\S]*?\\)\\s*insert\\s+into\\s+app\\.${table}\\b`,
  );
  if (!selfContainedValuesCte.test(seed)) {
    failures.push(`seeded ${table} must use a statement-local values cte`);
  }
}

for (const table of upsertedTables) {
  const upsert = new RegExp(
    `insert\\s+into\\s+app\\.${table}\\b[\\s\\S]*?on\\s+conflict\\b[\\s\\S]*?;`,
  );
  if (!upsert.test(seed)) {
    failures.push(`seeded ${table} must use conflict-safe upsert handling`);
  }
}

if (!/with\s+input\s*\([^;]+?\)\s+as\s*\(\s*values[\s\S]*?\)\s*update\s+app\.outlet_assignments\s+assignment/.test(seed)
  || !seed.includes('where not exists (\n  select 1 from app.outlet_assignments assignment')) {
  failures.push('outlet_assignments must use self-contained values for its natural-identity update and missing-row insert');
}
if (!seed.includes('join app.outlets outlet on outlet.code = input.outlet_code')
  || !seed.includes('join app.providers provider on provider.code = input.provider_code')) {
  failures.push('derived rows must resolve durable catalog ids by stable code');
}
if (!seed.includes('manual catalog') || !seed.includes('workflow history do not make a cloud seed application fail')) {
  failures.push('sql assertions must remain scoped to the synthetic baseline');
}
for (const table of forbiddenHistoryTables) {
  if (new RegExp(`insert\\s+into\\s+app\\.${table}\\b`).test(seed)) {
    failures.push(`must not seed ${table}`);
  }
}
for (const assertion of [
  'seed balance integrity failed',
  'seed feed integrity failed',
  'seed forecast integrity failed',
  'seed must contain healthy feed data',
]) {
  if (!seed.includes(assertion)) failures.push(`missing sql assertion: ${assertion}`);
}
if (!seed.includes("'healthy'")) failures.push('baseline must declare healthy feed/forecast data');
if (!seed.includes("'2025-12-31t09:00:00z'")) {
  failures.push('baseline timestamp must remain deterministic');
}

if (failures.length) {
  console.error(`Seed integrity check failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(
    `Seed integrity check passed: ${requiredTables.length} operational tables use statement-local VALUES CTEs; ${upsertedTables.length} use conflict-safe upserts; no session helper relations present; ${forbiddenHistoryTables.length} incident/workflow tables unseeded.`,
  );
}
