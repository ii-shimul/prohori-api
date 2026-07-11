import { Module } from '@nestjs/common';
import { CatalogAuthNotConfiguredGuard } from '../providers/catalog-auth-not-configured.guard';
import { MeController } from './me.controller';

@Module({
  controllers: [MeController],
  providers: [CatalogAuthNotConfiguredGuard],
})
export class AuthModule {}
