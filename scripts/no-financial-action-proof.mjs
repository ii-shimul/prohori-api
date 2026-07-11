import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const openapi = await readFile(resolve(root, 'openapi.yaml'), 'utf8');
const workflowSources = await Promise.all([
  readFile(resolve(root, 'src/alerts/alerts.controller.ts'), 'utf8'),
  readFile(resolve(root, 'src/alerts/alerts.service.ts'), 'utf8'),
  readFile(resolve(root, 'src/cases/cases.controller.ts'), 'utf8'),
  readFile(resolve(root, 'src/cases/cases.service.ts'), 'utf8'),
]);

const publicFinancialAction = /\/(?:[^\n]*)(?:transfer|refill|settlement|reversal|wallet|freeze|block|payment|payout)/i;
if (publicFinancialAction.test(openapi)) {
  throw new Error('OpenAPI exposes a prohibited public financial-action route.');
}

const workflowSource = workflowSources.join('\n');
for (const ledgerModel of ['transaction', 'outletCashBalance', 'providerBalance']) {
  if (new RegExp(`\\.${ledgerModel}\\b`).test(workflowSource)) {
    throw new Error(`Alert/case workflow source references ledger model ${ledgerModel}.`);
  }
}

const postRoutes = [...openapi.matchAll(/^  \/([^:]+):\n    post:/gm)].map((match) => match[1]);
const allowedPostRoutes = new Set([
  'ingestion/providers/{provider}/batches',
  'simulation/reset',
  'simulation/start',
  'simulation/step',
  'alerts/{id}/acknowledge',
  'alerts/{id}/assign',
  'alerts/{id}/create-case',
  'cases/{id}/acknowledge',
  'cases/{id}/assign',
  'cases/{id}/notes',
  'cases/{id}/request-verification',
  'cases/{id}/escalate',
  'cases/{id}/disposition',
  'cases/{id}/resolve',
  'cases/{id}/close',
  'cases/{id}/reopen',
]);
for (const route of postRoutes) {
  if (!allowedPostRoutes.has(route)) throw new Error(`Unexpected public POST route: /${route}`);
}

console.log(`No-financial-action proof passed: ${postRoutes.length} documented POST routes are allowlisted; alert/case workflows do not reference ledger models.`);
