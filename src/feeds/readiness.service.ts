import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

type ReadinessRow = {
  active_incident_count: bigint;
  generated_at: Date;
  latest_feed_received_at: Date | null;
  providers_degraded: bigint;
  providers_reporting: bigint;
  providers_unreliable: bigint;
  unresolved_outlet_count: bigint;
};

@Injectable()
export class ReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`set local role app_api`;
      await tx.$executeRaw`select set_config('request.jwt.claim.sub', ${user.id}, true)`;
      await tx.$executeRaw`select set_config('request.jwt.claim.role', ${user.role}, true)`;
      const role = await tx.providerMembership.findFirst({
        where: {
          isActive: true,
          role: { in: ['PLATFORM_MANAGEMENT', 'DEMO_ADMIN'] },
          userId: user.id,
        },
        select: { id: true },
      });
      if (!role) {
        throw new ForbiddenException({
          code: 'MANAGEMENT_ROLE_REQUIRED',
          message:
            'Platform management scope is required for readiness aggregates.',
        });
      }
      const [aggregate] = await tx.$queryRaw<ReadinessRow[]>(
        Prisma.sql`select * from app.platform_readiness_aggregates`,
      );
      if (!aggregate) {
        throw new ForbiddenException({
          code: 'MANAGEMENT_ROLE_REQUIRED',
          message:
            'Platform management scope is required for readiness aggregates.',
        });
      }
      return {
        activeIncidentCount: Number(aggregate.active_incident_count),
        generatedAt: aggregate.generated_at.toISOString(),
        latestFeedReceivedAt:
          aggregate.latest_feed_received_at?.toISOString() ?? null,
        providersDegraded: Number(aggregate.providers_degraded),
        providersReporting: Number(aggregate.providers_reporting),
        providersUnreliable: Number(aggregate.providers_unreliable),
        unresolvedOutletCount: Number(aggregate.unresolved_outlet_count),
      };
    });
  }
}
