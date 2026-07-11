import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CasesService } from './cases.service';

describe('CasesService workflow safety', () => {
  const baseCase = {
    id: '60000000-0000-4000-8000-000000000001',
    outletId: '30000000-0000-4000-8000-000000000001',
    providerId: '10000000-0000-4000-8000-000000000001',
    state: 'OPEN',
    version: 1,
    ownerUserId: null,
    resolutionCode: null,
    resolutionSummary: null,
    createdBy: '40000000-0000-4000-8000-000000000002',
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    closedAt: null,
  };
  const tx = {
    $executeRaw: jest.fn(),
    providerMembership: {
      findMany: jest.fn().mockResolvedValue([{ role: 'PROVIDER_OPERATIONS' }]),
    },
    case: {
      findUnique: jest.fn().mockResolvedValue(baseCase),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    caseCommandIdempotency: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    caseEvent: { create: jest.fn() },
    auditEvent: { create: jest.fn() },
    caseNote: { create: jest.fn() },
    outletAssignment: { findFirst: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  } as unknown as PrismaService;
  const service = new CasesService(prisma);
  const user = {
    id: '40000000-0000-4000-8000-000000000002',
    role: 'authenticated' as const,
  };
  const correlationId = '50000000-0000-4000-8000-000000000001';

  beforeEach(() => jest.clearAllMocks());
  it('rejects invalid OPEN-to-resolved transition without writing workflow history', async () => {
    await expect(
      service.resolve(
        user,
        baseCase.id,
        1,
        'VERIFIED_NORMAL_ACTIVITY',
        'Reviewed.',
        'k1',
        correlationId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.case.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
  it('denies a case outside the caller scope without adding an event or audit record', async () => {
    tx.case.findUnique.mockResolvedValueOnce(null);

    await expect(service.detail(user, baseCase.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.caseEvent.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('uses optimistic version, and records exactly one case event and audit event for acknowledgement', async () => {
    await service.acknowledge(user, baseCase.id, 1, 'k2', correlationId);
    expect(tx.case.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: baseCase.id, version: 1 } }),
    );
    expect(tx.caseEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tx)).not.toContain('providerBalance');
    expect(JSON.stringify(tx)).not.toContain('transaction');
  });
});
