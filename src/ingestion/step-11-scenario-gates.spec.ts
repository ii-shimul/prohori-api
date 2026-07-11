import { buildScenarioFixture } from './simulation.service';

describe('Step 11 deterministic scenario fixtures', () => {
  it('A creates Provider A e-money pressure evidence', () => {
    const fixture = buildScenarioFixture('A', 0);

    expect(fixture.provider).toBe('PROVIDER_A');
    expect(fixture.batch.events).toEqual([
      expect.objectContaining({ amountMinor: 50_000n, type: 'CASH_IN' }),
    ]);
  });

  it('B keeps shared-cash pressure inputs and unusual-activity inputs together but distinct', () => {
    const fixture = buildScenarioFixture('B', 0);

    expect(fixture.provider).toBe('PROVIDER_B');
    expect(fixture.batch.events).toHaveLength(4);
    expect(fixture.batch.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amountMinor: 30_000n, type: 'CASH_OUT' }),
      ]),
    );
    expect(
      new Set(fixture.batch.events.map((event) => event.eventId)).size,
    ).toBe(4);
  });

  it('C carries delayed and conflicting-snapshot quality evidence', () => {
    const fixture = buildScenarioFixture('C', 0);

    expect(fixture.batch.sourceAt.toISOString()).toBe(
      '2026-01-01T07:00:00.000Z',
    );
    expect(fixture.batch.snapshots).toEqual([
      expect.objectContaining({ amountMinor: 1n, resource: 'provider_efloat' }),
    ]);
  });

  it('D creates pressure evidence suitable for alert-to-case review without a ledger command', () => {
    const fixture = buildScenarioFixture('D', 0);

    expect(fixture.provider).toBe('PROVIDER_A');
    expect(fixture.batch.events).toEqual([
      expect.objectContaining({ amountMinor: 50_000n, type: 'CASH_IN' }),
    ]);
    expect(fixture.batch.events[0]).not.toHaveProperty('financialAction');
  });

  it.each(['A', 'B', 'C', 'D'] as const)(
    '%s is deterministic for clean resets',
    (scenario) => {
      expect(buildScenarioFixture(scenario, 0)).toEqual(
        buildScenarioFixture(scenario, 0),
      );
    },
  );
});
