import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { applyBalanceEvent, BalanceEvent } from './balance-semantics';

export interface PersistedBalanceEvent extends BalanceEvent {
  idempotencyKey: string;
  occurredAt: Date;
  outletId: string;
  providerEventId: string;
  providerId: string;
}

@Injectable()
export class LiquidityService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(event: PersistedBalanceEvent): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findFirst({
        where: {
          OR: [
            {
              providerId: event.providerId,
              providerEventId: event.providerEventId,
            },
            {
              providerId: event.providerId,
              idempotencyKey: event.idempotencyKey,
            },
          ],
        },
      });
      if (existing)
        throw new ConflictException('Provider event already recorded.');

      const [cash, provider] = await Promise.all([
        tx.outletCashBalance.findUniqueOrThrow({
          where: { outletId: event.outletId },
        }),
        tx.providerBalance.findUniqueOrThrow({
          where: {
            outletId_providerId: {
              outletId: event.outletId,
              providerId: event.providerId,
            },
          },
        }),
      ]);
      const next = applyBalanceEvent(
        {
          sharedCashMinor: cash.amountMinor,
          providerEfloatMinor: provider.amountMinor,
        },
        event,
      );
      await tx.transaction.create({ data: event });
      if (event.lifecycle === 'SETTLED') {
        await tx.outletCashBalance.update({
          where: { outletId: event.outletId },
          data: { amountMinor: next.sharedCashMinor },
        });
        await tx.providerBalance.update({
          where: {
            outletId_providerId: {
              outletId: event.outletId,
              providerId: event.providerId,
            },
          },
          data: { amountMinor: next.providerEfloatMinor },
        });
      }
    });
  }
}
