import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { IngestionService } from './ingestion.service';
import { SimulationService } from './simulation.service';

describe('SimulationService', () => {
  const tx = {
    anomalySignal: { deleteMany: jest.fn() },
    balanceSnapshot: { deleteMany: jest.fn() },
    liquidityAnomalyCorrelation: { deleteMany: jest.fn() },
    dataQualityIncident: { deleteMany: jest.fn() },
    feedBatch: { deleteMany: jest.fn() },
    outletCashBalance: { update: jest.fn() },
    providerBalance: { update: jest.fn() },
    simulationBalanceBaseline: { findMany: jest.fn() },
    simulationState: { upsert: jest.fn() },
    transaction: { deleteMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
    simulationState: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  } as unknown as PrismaService;
  const ingestionCalls: unknown[][] = [];
  const ingestion = {
    ingest: (...args: unknown[]) => {
      ingestionCalls.push(args);
      return Promise.resolve({ batchId: 'batch' });
    },
  } as unknown as IngestionService;
  const scope = { isDemoAdmin: jest.fn() } as unknown as ScopeService;
  const service = new SimulationService(ingestion, prisma, scope);
  const user = { id: 'admin', role: 'authenticated' as const };

  beforeEach(() => {
    ingestionCalls.length = 0;
    jest.clearAllMocks();
    (scope.isDemoAdmin as jest.Mock).mockResolvedValue(true);
    tx.simulationBalanceBaseline.findMany.mockResolvedValue([]);
  });

  it('denies non-admin simulator controls', async () => {
    (scope.isDemoAdmin as jest.Mock).mockResolvedValue(false);
    await expect(service.start(user, 'A')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('restarts deterministically and feeds fixtures through ingestion', async () => {
    const first = await service.start(user, 'A');
    const second = await service.start(user, 'A');
    expect(first.receipt).toEqual(second.receipt);
    expect(ingestionCalls).toHaveLength(2);
    expect(ingestionCalls[0]).toEqual(ingestionCalls[1]);
  });
});
