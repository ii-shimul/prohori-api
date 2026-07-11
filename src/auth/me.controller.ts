import { Controller, Get, UseGuards } from '@nestjs/common';
import { CatalogAuthNotConfiguredGuard } from '../providers/catalog-auth-not-configured.guard';

@Controller('me')
@UseGuards(CatalogAuthNotConfiguredGuard)
export class MeController {
  @Get()
  getCurrentUser(): never {
    throw new Error('Authentication is configured in Step 3.');
  }
}
