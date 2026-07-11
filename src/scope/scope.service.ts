import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser, CurrentUserResponse } from '../auth/auth.types';

@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async isDemoAdmin(user: AuthenticatedUser): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`set local role app_api`;
      await transaction.$executeRaw`
        select set_config('request.jwt.claim.sub', ${user.id}, true)
      `;
      const membership = await transaction.providerMembership.findFirst({
        where: { userId: user.id, role: 'DEMO_ADMIN', isActive: true },
        select: { id: true },
      });
      return Boolean(membership);
    });
  }

  async getCurrentUser(user: AuthenticatedUser): Promise<CurrentUserResponse> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`set local role app_api`;
      await transaction.$executeRaw`
        select set_config('request.jwt.claim.sub', ${user.id}, true)
      `;
      await transaction.$executeRaw`
        select set_config('request.jwt.claim.role', ${user.role}, true)
      `;

      const profile = await transaction.profile.findUnique({
        where: { id: user.id },
        include: {
          assignments: {
            where: { isActive: true },
            select: {
              areaId: true,
              outletId: true,
              providerId: true,
              role: true,
            },
          },
          memberships: {
            where: { isActive: true },
            select: { providerId: true, role: true },
          },
        },
      });

      if (!profile || !profile.isActive) {
        throw new NotFoundException({
          code: 'PROFILE_NOT_FOUND',
          message: 'No active application profile exists for this user.',
        });
      }

      return {
        assignments: profile.assignments,
        id: profile.id,
        locale: profile.locale,
        memberships: profile.memberships,
      };
    });
  }
}
