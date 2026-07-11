import { PrismaService } from '../database/prisma.service';
import { FeedsService } from './feeds.service';

describe('FeedsService', () => {
  const tx = {
    $executeRaw: jest.fn(),
    dataQualityIncident: { findMany: jest.fn() },
    feedBatch: { findMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  } as unknown as PrismaService;
  const service = new FeedsService(prisma);
  const user = {
    id: '40000000-0000-4000-8000-000000000001',
    role: 'authenticated' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.dataQualityIncident.findMany.mockResolvedValue([
      {
        category: 'CONFLICTING_SNAPSHOT',
        detectedAt: new Date('2026-01-01T12:00:00.000Z'),
        providerId: '10000000-0000-4000-8000-000000000001',
      },
    ]);
    tx.feedBatch.findMany.mockResolvedValue([
      {
        id: '20000000-0000-4000-8000-000000000001',
        providerId: '10000000-0000-4000-8000-000000000001',
        qualityStatus: 'degraded',
        receivedAt: new Date('2026-01-01T12:00:00.000Z'),
        sequence: 7n,
      },
    ]);
  });

  it('uses a scoped transaction and exposes only derived feed health', async () => {
    const page = await service.listFeedHealth(user, { limit: 50 });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(page).toEqual({
      items: [
        expect.objectContaining({
          activeIncidentCount: 1,
          dataQuality: 'unreliable',
          sequence: '7',
        }),
      ],
      nextCursor: null,
    });
  });

  it('applies provider and outlet filters as narrowing incident filters', async () => {
    await service.listIncidents(user, {
      limit: 20,
      outletId: '30000000-0000-4000-8000-000000000001',
      providerId: '10000000-0000-4000-8000-000000000001',
    });

    expect(tx.dataQualityIncident.findMany).toHaveBeenCalledWith({
      orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
      take: 21,
      where: {
        outletId: '30000000-0000-4000-8000-000000000001',
        providerId: '10000000-0000-4000-8000-000000000001',
      },
    });
  });
});
