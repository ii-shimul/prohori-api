import { PrismaService } from '../database/prisma.service';
import { AnalyticsService, deriveDataQuality } from './analytics.service';

describe('AnalyticsService', () => {
  const tx = {
    $executeRaw: jest.fn(),
    dataQualityIncident: { findMany: jest.fn() },
    forecastPoint: { createMany: jest.fn() },
    forecastRun: { create: jest.fn() },
    outlet: { findUnique: jest.fn() },
    outletCashBalance: { findUniqueOrThrow: jest.fn() },
    providerBalance: { findMany: jest.fn() },
    transaction: { findMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  } as unknown as PrismaService;
  const service = new AnalyticsService(prisma);
  const user = {
    id: '40000000-0000-4000-8000-000000000006',
    role: 'authenticated' as const,
  };
  const outletId = '30000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    jest.clearAllMocks();
    tx.outlet.findUnique.mockResolvedValue({ id: outletId });
    tx.outletCashBalance.findUniqueOrThrow.mockResolvedValue({
      amountMinor: 850_000n,
    });
    tx.providerBalance.findMany.mockResolvedValue([
      {
        amountMinor: 300_000n,
        providerId: '10000000-0000-4000-8000-000000000001',
        provider: {
          code: 'PROVIDER_A',
          id: '10000000-0000-4000-8000-000000000001',
          name: 'Provider A',
        },
      },
    ]);
    tx.transaction.findMany.mockResolvedValue([
      {
        amountMinor: 50_000n,
        lifecycle: 'SETTLED',
        occurredAt: new Date('2026-01-01T11:00:00.000Z'),
        providerId: '10000000-0000-4000-8000-000000000001',
        type: 'CASH_IN',
      },
    ]);
    tx.dataQualityIncident.findMany.mockResolvedValue([]);
    tx.forecastRun.create.mockResolvedValue({ id: 'run-id' });
  });

  it('persists an explainable run and point snapshots for every resource horizon', async () => {
    const forecast = await service.getForecasts(user, outletId);

    expect(forecast.id).toBe('run-id');
    expect(forecast.resources).toHaveLength(2);
    expect(tx.forecastRun.create).toHaveBeenCalledTimes(1);
    expect(tx.forecastPoint.createMany).toHaveBeenCalledTimes(1);
  });

  it('maps stale feed data to degraded and conflicting feed data to unreliable', () => {
    expect(deriveDataQuality(['FRESHNESS_LAG'])).toBe('degraded');
    expect(deriveDataQuality(['CONFLICTING_SNAPSHOT'])).toBe('unreliable');
  });
});
