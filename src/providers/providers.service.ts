import { Injectable } from '@nestjs/common';
import {
  OutletStatus,
  Prisma,
  ProviderCode,
  ProviderStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { CatalogArea, CatalogOutlet, CatalogProvider } from './catalog.types';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async listProviders(user: AuthenticatedUser): Promise<CatalogProvider[]> {
    return this.withScope(user, async (tx) => {
      const providers = await tx.provider.findMany({
        orderBy: { code: 'asc' },
        select: { code: true, id: true, name: true, status: true },
      });
      return providers.map((provider) => this.toProvider(provider));
    });
  }

  async listAreas(user: AuthenticatedUser): Promise<CatalogArea[]> {
    return this.withScope(user, (tx) =>
      tx.area.findMany({
        orderBy: { code: 'asc' },
        select: { code: true, id: true, name: true, parentId: true },
      }),
    );
  }

  async listOutlets(
    user: AuthenticatedUser,
    areaCode?: string,
  ): Promise<CatalogOutlet[]> {
    return this.withScope(user, async (tx) => {
      const outlets = await tx.outlet.findMany({
        where: areaCode ? { area: { code: areaCode } } : undefined,
        orderBy: { code: 'asc' },
        select: {
          area: {
            select: { code: true, id: true, name: true, parentId: true },
          },
          code: true,
          id: true,
          name: true,
          status: true,
          tier: true,
          timezone: true,
        },
      });
      return outlets.map((outlet) => ({
        ...outlet,
        status: this.toOutletStatus(outlet.status),
      }));
    });
  }

  private async withScope<T>(
    user: AuthenticatedUser,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`set local role app_api`;
      await tx.$executeRaw`select set_config('request.jwt.claim.sub', ${user.id}, true)`;
      await tx.$executeRaw`select set_config('request.jwt.claim.role', ${user.role}, true)`;
      return operation(tx);
    });
  }

  private toProvider(provider: {
    code: ProviderCode;
    id: string;
    name: string;
    status: ProviderStatus;
  }): CatalogProvider {
    return {
      ...provider,
      code: provider.code,
      status: this.toProviderStatus(provider.status),
    };
  }

  private toProviderStatus(status: ProviderStatus): CatalogProvider['status'] {
    return status;
  }

  private toOutletStatus(status: OutletStatus): CatalogOutlet['status'] {
    return status;
  }
}
