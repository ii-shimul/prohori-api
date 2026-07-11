import { forecastLiquidity } from './liquidity-forecast';

const now = new Date('2026-01-01T12:00:00.000Z');
const transaction = (
  amountMinor: bigint,
  minutesAgo: number,
  providerId = 'provider-a',
  type: 'CASH_IN' | 'CASH_OUT' = 'CASH_IN',
) => ({
  amountMinor,
  lifecycle: 'SETTLED' as const,
  occurredAt: new Date(now.getTime() - minutesAgo * 60_000),
  providerId,
  type,
});

describe('forecastLiquidity', () => {
  it('projects normal separate shared-cash and provider e-money resources', () => {
    const result = forecastLiquidity({
      dataQuality: 'healthy',
      generatedAt: now,
      history: [transaction(10_000n, 90), transaction(10_000n, 30)],
      resources: [
        { currentMinor: 900_000n, resource: 'shared_cash' },
        {
          currentMinor: 500_000n,
          providerId: 'provider-a',
          resource: 'provider_efloat',
        },
      ],
    });

    expect(result.resources).toHaveLength(2);
    expect(result.resources[0].resource).toBe('shared_cash');
    expect(result.resources[1].resource).toBe('provider_efloat');
    expect(result.resources[1].points).toHaveLength(4);
    expect(result.resources[1].points[0].projectedMidMinor).toBeLessThan(
      500_000n,
    );
    expect(result.modelConfidence).toBeGreaterThan(0);
  });

  it('widens the bounded projection under a surge', () => {
    const result = forecastLiquidity({
      dataQuality: 'healthy',
      generatedAt: now,
      history: [transaction(5_000n, 100), transaction(80_000n, 10)],
      resources: [
        {
          currentMinor: 500_000n,
          providerId: 'provider-a',
          resource: 'provider_efloat',
        },
      ],
    });
    const point = result.resources[0].points[3];

    expect(point.projectedLowMinor).toBeLessThan(point.projectedMidMinor);
    expect(point.projectedMidMinor).toBeLessThanOrEqual(
      point.projectedHighMinor,
    );
  });

  it('identifies Provider A e-money as the Scenario A limiting resource, never a combined balance', () => {
    const result = forecastLiquidity({
      dataQuality: 'healthy',
      generatedAt: now,
      history: [transaction(50_000n, 60), transaction(50_000n, 1)],
      resources: [
        { currentMinor: 850_000n, resource: 'shared_cash' },
        {
          currentMinor: 30_000n,
          providerId: 'provider-a',
          resource: 'provider_efloat',
        },
        {
          currentMinor: 420_000n,
          providerId: 'provider-b',
          resource: 'provider_efloat',
        },
      ],
    });

    expect(result.limitingResource).toEqual({
      providerId: 'provider-a',
      resource: 'provider_efloat',
    });
  });

  it('handles low balances and empty/sparse history without inventing demand', () => {
    const result = forecastLiquidity({
      dataQuality: 'healthy',
      generatedAt: now,
      history: [],
      resources: [{ currentMinor: 10_000n, resource: 'shared_cash' }],
    });
    const point = result.resources[0].points[0];

    expect(result.modelConfidence).toBe(0);
    expect(point.projectedMidMinor).toBe(10_000n);
    expect(point.likelyDepletionEtaMinutes).toBeNull();
    expect(point.reserveEtaMinutes).toBeNull();
  });

  it.each(['degraded', 'unreliable'] as const)(
    'retains analytical confidence when %s quality is supplied',
    (dataQuality) => {
      const result = forecastLiquidity({
        dataQuality,
        generatedAt: now,
        history: [transaction(25_000n, 60)],
        resources: [
          {
            currentMinor: 200_000n,
            providerId: 'provider-a',
            resource: 'provider_efloat',
          },
        ],
      });
      expect(result.dataQuality).toBe(dataQuality);
      expect(result.modelConfidence).toBeGreaterThan(0);
    },
  );

  it('suppresses exact ETAs for stale/conflicting unreliable feed data', () => {
    const result = forecastLiquidity({
      dataQuality: 'unreliable',
      generatedAt: now,
      history: [transaction(50_000n, 60)],
      resources: [
        {
          currentMinor: 100_000n,
          providerId: 'provider-a',
          resource: 'provider_efloat',
        },
      ],
    });

    for (const point of result.resources[0].points) {
      expect(point.likelyDepletionEtaMinutes).toBeNull();
      expect(point.reserveEtaMinutes).toBeNull();
    }
    expect(result.modelConfidence).toBeGreaterThan(0);
  });
});
