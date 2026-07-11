import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { applyBalanceEvent } from '../liquidity/balance-semantics';
import {
  IngestionBatch,
  IngestionReceipt,
  ProviderCode,
} from './ingestion.types';
import {
  calculateBatchChecksum,
  payloadForChecksum,
} from './ingestion.validation';

const MAX_SOURCE_LAG_MS = 15 * 60 * 1000;

@Injectable()
export class IngestionService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(
    providerCode: ProviderCode,
    batch: IngestionBatch,
  ): Promise<IngestionReceipt> {
    if (
      calculateBatchChecksum(payloadForChecksum(batch)) !==
      batch.checksum.toLowerCase()
    ) {
      throw new BadRequestException({
        code: 'CHECKSUM_MISMATCH',
        message: 'The batch checksum does not match its canonical payload.',
      });
    }
    if (batch.sourceAt > batch.receivedAt) {
      throw new BadRequestException({
        code: 'INVALID_BATCH_TIMESTAMPS',
        message: 'sourceAt must not be later than receivedAt.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const provider = await tx.provider.findUnique({
        where: { code: providerCode },
      });
      if (!provider) throw new ConflictException('Provider is not configured.');

      const latest = await tx.feedBatch.findFirst({
        where: { providerId: provider.id },
        orderBy: { sequence: 'desc' },
      });
      const existing = await tx.feedBatch.findUnique({
        where: {
          providerId_sequence: {
            providerId: provider.id,
            sequence: batch.sequence,
          },
        },
      });
      if (existing) {
        throw new ConflictException({
          code: 'DUPLICATE_BATCH_SEQUENCE',
          message: 'This provider sequence has already been received.',
        });
      }

      const quality: Array<{
        category: string;
        details: Prisma.InputJsonObject;
        outletId?: string;
      }> = [];
      if (
        batch.receivedAt.getTime() - batch.sourceAt.getTime() >
        MAX_SOURCE_LAG_MS
      ) {
        quality.push({
          category: 'FRESHNESS_LAG',
          details: {
            sourceAt: batch.sourceAt.toISOString(),
            receivedAt: batch.receivedAt.toISOString(),
          },
        });
      }
      if (latest && batch.sequence !== latest.sequence + 1n) {
        quality.push({
          category:
            batch.sequence < latest.sequence
              ? 'OUT_OF_ORDER_SEQUENCE'
              : 'SEQUENCE_GAP',
          details: {
            expected: (latest.sequence + 1n).toString(),
            received: batch.sequence.toString(),
          },
        });
      }
      if (batch.events.length === 0 && batch.snapshots.length === 0) {
        quality.push({
          category: 'INCOMPLETE_PAYLOAD',
          details: { reason: 'Batch has no events or snapshots.' },
        });
      }

      const feedBatch = await tx.feedBatch.create({
        data: {
          checksum: batch.checksum.toLowerCase(),
          providerId: provider.id,
          qualityStatus: quality.length ? 'degraded' : 'healthy',
          eventCount: batch.events.length,
          receivedAt: batch.receivedAt,
          sequence: batch.sequence,
          sourceAt: batch.sourceAt,
        },
      });

      let acceptedEvents = 0;
      let duplicateEvents = 0;
      let rejectedEvents = 0;
      for (const event of batch.events) {
        const outlet = await tx.outlet.findUnique({
          where: { code: event.outletCode },
        });
        if (
          !outlet ||
          event.occurredAt > event.receivedAt ||
          event.receivedAt > batch.receivedAt
        ) {
          rejectedEvents++;
          quality.push({
            category: 'INVALID_EVENT_SCOPE_OR_TIME',
            details: { eventId: event.eventId, outletCode: event.outletCode },
          });
          continue;
        }
        const current = await tx.transaction.findFirst({
          where: {
            OR: [
              { providerId: provider.id, providerEventId: event.eventId },
              { providerId: provider.id, idempotencyKey: event.idempotencyKey },
            ],
          },
        });
        if (current) {
          duplicateEvents++;
          quality.push({
            category: 'DUPLICATE_OR_REPLAYED_EVENT',
            details: { eventId: event.eventId },
          });
          continue;
        }
        const [cash, efloat] = await Promise.all([
          tx.outletCashBalance.findUnique({ where: { outletId: outlet.id } }),
          tx.providerBalance.findUnique({
            where: {
              outletId_providerId: {
                outletId: outlet.id,
                providerId: provider.id,
              },
            },
          }),
        ]);
        if (!cash || !efloat) {
          rejectedEvents++;
          quality.push({
            category: 'OUTLET_PROVIDER_SCOPE_MISMATCH',
            details: { eventId: event.eventId, outletCode: event.outletCode },
            outletId: outlet.id,
          });
          continue;
        }
        try {
          const next = applyBalanceEvent(
            {
              sharedCashMinor: cash.amountMinor,
              providerEfloatMinor: efloat.amountMinor,
            },
            event,
          );
          await tx.transaction.create({
            data: {
              amountMinor: event.amountMinor,
              eventVersion: event.eventVersion,
              feedBatchId: feedBatch.id,
              idempotencyKey: event.idempotencyKey,
              lifecycle: event.lifecycle,
              occurredAt: event.occurredAt,
              outletId: outlet.id,
              providerEventId: event.eventId,
              providerId: provider.id,
              type: event.type,
            },
          });
          if (event.lifecycle === 'SETTLED') {
            await tx.outletCashBalance.update({
              where: { outletId: outlet.id },
              data: { amountMinor: next.sharedCashMinor },
            });
            await tx.providerBalance.update({
              where: {
                outletId_providerId: {
                  outletId: outlet.id,
                  providerId: provider.id,
                },
              },
              data: { amountMinor: next.providerEfloatMinor },
            });
          }
          acceptedEvents++;
        } catch (error) {
          if (error instanceof RangeError) {
            rejectedEvents++;
            quality.push({
              category: 'BALANCE_MISMATCH',
              details: { eventId: event.eventId, reason: error.message },
              outletId: outlet.id,
            });
            continue;
          }
          throw error;
        }
      }

      for (const snapshot of batch.snapshots) {
        const outlet = await tx.outlet.findUnique({
          where: { code: snapshot.outletCode },
        });
        if (!outlet) {
          quality.push({
            category: 'INVALID_SNAPSHOT_OUTLET',
            details: { outletCode: snapshot.outletCode },
          });
          continue;
        }
        const position =
          snapshot.resource === 'shared_cash'
            ? await tx.outletCashBalance.findUnique({
                where: { outletId: outlet.id },
              })
            : await tx.providerBalance.findUnique({
                where: {
                  outletId_providerId: {
                    outletId: outlet.id,
                    providerId: provider.id,
                  },
                },
              });
        await tx.balanceSnapshot.create({
          data: {
            amountMinor: snapshot.amountMinor,
            observedAt: snapshot.observedAt,
            outletId: outlet.id,
            providerId:
              snapshot.resource === 'provider_efloat' ? provider.id : null,
            resource: snapshot.resource,
          },
        });
        if (!position || position.amountMinor !== snapshot.amountMinor) {
          quality.push({
            category: 'CONFLICTING_SNAPSHOT',
            details: {
              observed: snapshot.amountMinor.toString(),
              recorded: position?.amountMinor.toString() ?? null,
              resource: snapshot.resource,
            },
            outletId: outlet.id,
          });
        }
      }

      if (quality.length) {
        await tx.feedBatch.update({
          where: { id: feedBatch.id },
          data: { qualityStatus: 'degraded' },
        });
        await tx.dataQualityIncident.createMany({
          data: quality.map((incident) => ({
            category: incident.category,
            details: incident.details,
            outletId: incident.outletId ?? null,
            providerId: provider.id,
          })),
        });
      }
      return {
        acceptedEvents,
        batchId: feedBatch.id,
        duplicateEvents,
        provider: providerCode,
        qualityStatus: quality.length ? 'degraded' : 'healthy',
        rejectedEvents,
        sequence: batch.sequence.toString(),
      };
    });
  }
}
