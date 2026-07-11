import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CatalogAuthNotConfiguredGuard } from './catalog-auth-not-configured.guard';
import { CatalogArea, CatalogOutlet, CatalogProvider } from './catalog.types';
import { ProvidersService } from './providers.service';

const outletQuerySchema = z.object({
  areaCode: z.string().trim().min(1).max(50).optional(),
});

@Controller()
@UseGuards(CatalogAuthNotConfiguredGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get('providers')
  listProviders(): Promise<CatalogProvider[]> {
    return this.providersService.listProviders();
  }

  @Get('areas')
  listAreas(): Promise<CatalogArea[]> {
    return this.providersService.listAreas();
  }

  @Get('outlets')
  listOutlets(@Query() query: unknown): Promise<CatalogOutlet[]> {
    const { areaCode } = outletQuerySchema.parse(query);

    return this.providersService.listOutlets(areaCode);
  }
}
