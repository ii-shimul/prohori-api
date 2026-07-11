import { Module } from '@nestjs/common';
import { CatalogAuthNotConfiguredGuard } from './catalog-auth-not-configured.guard';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  controllers: [ProvidersController],
  providers: [ProvidersService, CatalogAuthNotConfiguredGuard],
})
export class ProvidersModule {}
