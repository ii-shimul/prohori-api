import { Injectable } from '@nestjs/common';
import { OutletStatus, ProviderCode, ProviderStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CatalogArea, CatalogOutlet, CatalogProvider } from './catalog.types';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async listProviders(): Promise<CatalogProvider[]> {
    const providers = await this.prisma.provider.findMany({
      orderBy: { code: 'asc' },
      select: { code: true, id: true, name: true, status: true },
    });

    return providers.map((provider) => this.toProvider(provider));
  }

  async listAreas(): Promise<CatalogArea[]> {
    const areas = await this.prisma.area.findMany({
      orderBy: { code: 'asc' },
      select: { code: true, id: true, name: true, parentId: true },
    });

    return areas;
  }

  async listOutlets(areaCode?: string): Promise<CatalogOutlet[]> {
    const outlets = await this.prisma.outlet.findMany({
      where: areaCode ? { area: { code: areaCode } } : undefined,
      orderBy: { code: 'asc' },
      select: {
        area: { select: { code: true, id: true, name: true, parentId: true } },
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
