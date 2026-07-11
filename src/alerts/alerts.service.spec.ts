import { PrismaService } from '../database/prisma.service';
import { AlertsService } from './alerts.service';

describe('AlertsService', () => {
  const tx = {
    $executeRaw: jest.fn(),
    alert: { findMany: jest.fn(), upsert: jest.fn() },
    alertActionIdempotency: { findUnique: jest.fn(), create: jest.fn() },
    alertCaseRequest: { upsert: jest.fn() },
    alertEvidenceSnapshot: { create: jest.fn(), findMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  } as unknown as PrismaService;
  const service = new AlertsService(prisma);
  const generatedAt = new Date('2026-01-01T12:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    tx.alert.upsert.mockResolvedValue({
      id: '90000000-0000-4000-8000-000000000001',
    });
  });

  it('deduplicates a provider pressure episode using a stable type/outlet/provider/window fingerprint', async () => {
    const input = {
      anomalySignals: [],
      dataQuality: 'healthy' as const,
      forecastRunId: '70000000-0000-4000-8000-000000000001',
      generatedAt,
      hasCorrelation: false,
      incidentCount: 0,
      modelConfidence: 0.8,
      outletId: '30000000-0000-4000-8000-000000000001',
      resources: [
        {
          providerId: '10000000-0000-4000-8000-000000000001',
          resource: 'provider_efloat' as const,
          points: [{ horizonMinutes: 30, riskBand: 'high' }],
        },
      ],
    };

    await service.syncForecastAlerts(tx as never, input);
    await service.syncForecastAlerts(tx as never, input);

    const fingerprint =
      'provider_emoney_pressure:30000000-0000-4000-8000-000000000001:10000000-0000-4000-8000-000000000001:2026-01-01T12';
    expect(tx.alert.upsert).toHaveBeenCalledTimes(2);
    expect(tx.alert.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { fingerprint } }),
    );
    expect(tx.alert.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { fingerprint } }),
    );
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('keeps shared-cash alert views provider-redacted', async () => {
    tx.alert.findMany.mockResolvedValue([
      {
        id: '90000000-0000-4000-8000-000000000002',
        outletId: '30000000-0000-4000-8000-000000000001',
        providerId: null,
        resource: 'shared_cash',
        type: 'shared_cash_pressure',
        severity: 'high',
        status: 'open',
        active: true,
        episodeStartedAt: generatedAt,
        lastObservedAt: generatedAt,
        occurrenceCount: 1,
        messageKey: 'alerts.shared_cash_pressure.review',
        messageParams: {},
        evidence: { providerProjectionCount: 3 },
        dataQuality: 'healthy',
        modelConfidence: 0.8,
        ownerUserId: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
      },
    ]);

    const alerts = await service.list(
      { id: '40000000-0000-4000-8000-000000000001', role: 'authenticated' },
      {},
    );

    expect(alerts[0]).toMatchObject({
      providerId: null,
      resource: 'shared_cash',
    });
    expect(JSON.stringify(alerts[0])).not.toContain('10000000-');
  });
});
