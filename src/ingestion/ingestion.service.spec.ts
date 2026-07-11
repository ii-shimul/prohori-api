import { PrismaService } from '../database/prisma.service';
import { IngestionService } from './ingestion.service';
import {
  calculateBatchChecksum,
  parseIngestionBatch,
  payloadForChecksum,
} from './ingestion.validation';

const rawBatch = () => {
  const payload = {
    events: [
      {
        amountMinor: 100,
        eventId: 'event-1',
        eventVersion: 1,
        idempotencyKey: 'key-1',
        lifecycle: 'SETTLED',
        occurredAt: '2026-01-01T08:00:00.000Z',
        outletCode: 'DN-001',
        receivedAt: '2026-01-01T08:00:10.000Z',
        type: 'CASH_IN',
      },
    ],
    receivedAt: '2026-01-01T08:00:10.000Z',
    sequence: 1,
    snapshots: [],
    sourceAt: '2026-01-01T08:00:00.000Z',
  };
  return parseIngestionBatch({
    ...payload,
    checksum: calculateBatchChecksum(payload),
  });
};

describe('IngestionService', () => {
  const tx = {
    balanceSnapshot: { create: jest.fn() },
    dataQualityIncident: { createMany: jest.fn() },
    feedBatch: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    outlet: { findUnique: jest.fn() },
    outletCashBalance: { findUnique: jest.fn(), update: jest.fn() },
    provider: { findUnique: jest.fn() },
    providerBalance: { findUnique: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn(), findFirst: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  } as unknown as PrismaService;
  const service = new IngestionService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.provider.findUnique.mockResolvedValue({ id: 'provider-id' });
    tx.feedBatch.findFirst.mockResolvedValue(null);
    tx.feedBatch.findUnique.mockResolvedValue(null);
    tx.feedBatch.create.mockResolvedValue({ id: 'batch-id' });
    tx.outlet.findUnique.mockResolvedValue({ id: 'outlet-id' });
    tx.transaction.findFirst.mockResolvedValue(null);
    tx.outletCashBalance.findUnique.mockResolvedValue({ amountMinor: 500n });
    tx.providerBalance.findUnique.mockResolvedValue({ amountMinor: 500n });
  });

  it('accepts a verified provider batch and applies its settled event once', async () => {
    const receipt = await service.ingest('PROVIDER_A', rawBatch());
    expect(receipt).toMatchObject({
      acceptedEvents: 1,
      qualityStatus: 'healthy',
    });
    expect(tx.transaction.create).toHaveBeenCalledTimes(1);
    expect(tx.outletCashBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { amountMinor: 600n } }),
    );
  });

  it('records replay evidence without double-applying a duplicate event', async () => {
    tx.transaction.findFirst.mockResolvedValue({ id: 'existing' });
    const receipt = await service.ingest('PROVIDER_A', rawBatch());
    expect(receipt).toMatchObject({
      acceptedEvents: 0,
      duplicateEvents: 1,
      qualityStatus: 'degraded',
    });
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.dataQualityIncident.createMany).toHaveBeenCalledTimes(1);
  });

  it('captures sequence gaps and conflicting snapshots as quality evidence', async () => {
    tx.feedBatch.findFirst.mockResolvedValue({ sequence: 1n });
    const input = rawBatch();
    input.sequence = 3n;
    input.snapshots = [
      {
        amountMinor: 1n,
        observedAt: input.sourceAt,
        outletCode: 'DN-001',
        resource: 'provider_efloat',
      },
    ];
    input.checksum = calculateBatchChecksum(payloadForChecksum(input));
    const receipt = await service.ingest('PROVIDER_A', input);
    expect(receipt.qualityStatus).toBe('degraded');
    expect(tx.dataQualityIncident.createMany).toHaveBeenCalledTimes(1);
  });
});
