import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { deriveDataQuality } from '../analytics/analytics.service';

type ScopedTransaction = Prisma.TransactionClient;

export interface PageQuery {
  cursor?: string;
  limit: number;
  outletId?: string;
  providerId?: string;
}

@Injectable()
export class FeedsService {
  constructor(private readonly prisma: PrismaService) {}

  async listFeedHealth(user: AuthenticatedUser, query: PageQuery) {
    return this.withScope(user, async (tx) => {
      const incidents = await tx.dataQualityIncident.findMany({
        where: {
          ...(query.outletId ? { outletId: query.outletId } : {}),
          ...(query.providerId ? { providerId: query.providerId } : {}),
          resolvedAt: null,
        },
        select: { category: true, detectedAt: true, providerId: true },
      });
      const providerIds = [
        ...new Set(incidents.flatMap((incident) => incident.providerId ?? [])),
      ];
      const batches = await tx.feedBatch.findMany({
        where: {
          ...(query.providerId ? { providerId: query.providerId } : {}),
          ...(query.outletId ? { providerId: { in: providerIds } } : {}),
        },
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const page = batches.slice(0, query.limit);
      return {
        items: page.map((batch) => {
          const providerIncidents = incidents.filter(
            (incident) => incident.providerId === batch.providerId,
          );
          return {
            activeIncidentCount: providerIncidents.length,
            dataQuality: deriveDataQuality(
              providerIncidents.map((incident) => incident.category),
            ),
            latestIncidentAt:
              providerIncidents
                .map((incident) => incident.detectedAt)
                .sort((left, right) => right.getTime() - left.getTime())[0]
                ?.toISOString() ?? null,
            providerId: batch.providerId,
            qualityStatus: batch.qualityStatus,
            receivedAt: batch.receivedAt.toISOString(),
            sequence: batch.sequence.toString(),
          };
        }),
        nextCursor:
          batches.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  async listIncidents(user: AuthenticatedUser, query: PageQuery) {
    return this.withScope(user, async (tx) => {
      const incidents = await tx.dataQualityIncident.findMany({
        where: {
          ...(query.outletId ? { outletId: query.outletId } : {}),
          ...(query.providerId ? { providerId: query.providerId } : {}),
        },
        orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const page = incidents.slice(0, query.limit);
      return {
        items: page.map((incident) => ({
          category: incident.category,
          detectedAt: incident.detectedAt.toISOString(),
          details: incident.details,
          id: incident.id,
          outletId: incident.outletId,
          providerId: incident.providerId,
          resolvedAt: incident.resolvedAt?.toISOString() ?? null,
        })),
        nextCursor:
          incidents.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  private async withScope<T>(
    user: AuthenticatedUser,
    operation: (tx: ScopedTransaction) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`set local role app_api`;
      await tx.$executeRaw`select set_config('request.jwt.claim.sub', ${user.id}, true)`;
      await tx.$executeRaw`select set_config('request.jwt.claim.role', ${user.role}, true)`;
      return operation(tx);
    });
  }
}
