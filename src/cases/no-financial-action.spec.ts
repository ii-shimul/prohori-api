import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('workflow no-financial-action boundary', () => {
  const workflowFiles = [
    'src/alerts/alerts.controller.ts',
    'src/alerts/alerts.service.ts',
    'src/cases/cases.controller.ts',
    'src/cases/cases.service.ts',
  ];

  it('does not let alert or case workflow modules reference transaction or balance ledgers', () => {
    const source = workflowFiles
      .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
      .join('\n');

    for (const ledgerModel of [
      'transaction',
      'outletCashBalance',
      'providerBalance',
    ]) {
      expect(source).not.toMatch(new RegExp(`\\.${ledgerModel}\\b`));
    }
  });
});
