import { PrismaService } from '../database/prisma.service';
import { LiquidityService } from './liquidity.service';

describe('LiquidityService', () => {
  const tx = {
    outletCashBalance: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    providerBalance: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn(), findFirst: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
    ),
  } as unknown as PrismaService;
  const service = new LiquidityService(prisma);
  const event = {
    amountMinor: 100n,
    idempotencyKey: 'key',
    lifecycle: 'SETTLED' as const,
    occurredAt: new Date(),
    outletId: 'outlet',
    providerEventId: 'event',
    providerId: 'provider',
    type: 'CASH_IN' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.transaction.findFirst.mockResolvedValue(null);
    tx.outletCashBalance.findUniqueOrThrow.mockResolvedValue({
      amountMinor: 500n,
    });
    tx.providerBalance.findUniqueOrThrow.mockResolvedValue({
      amountMinor: 500n,
    });
  });

  it('writes event and both balances atomically for settled cash-in', async () => {
    await service.recordEvent(event);
    expect(tx.transaction.create).toHaveBeenCalled();
    expect(tx.outletCashBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { amountMinor: 600n } }),
    );
    expect(tx.providerBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { amountMinor: 400n } }),
    );
  });

  it('rejects duplicate event before changing balances', async () => {
    tx.transaction.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(service.recordEvent(event)).rejects.toThrow(
      'already recorded',
    );
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
});
