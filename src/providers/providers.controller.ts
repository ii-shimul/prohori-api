import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { CatalogArea, CatalogOutlet, CatalogProvider } from './catalog.types';
import { ProvidersService } from './providers.service';

const outletQuerySchema = z.object({
  areaCode: z.string().trim().min(1).max(50).optional(),
});

@Controller()
@UseGuards(SupabaseJwtGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get('providers')
  listProviders(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CatalogProvider[]> {
    return this.providersService.listProviders(user);
  }

  @Get('areas')
  listAreas(@CurrentUser() user: AuthenticatedUser): Promise<CatalogArea[]> {
    return this.providersService.listAreas(user);
  }

  @Get('outlets')
  listOutlets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ): Promise<CatalogOutlet[]> {
    const parsed = outletQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_OUTLET_QUERY',
        message: 'areaCode must be 1–50 characters when supplied.',
      });
    }
    return this.providersService.listOutlets(user, parsed.data.areaCode);
  }
}
