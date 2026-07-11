import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { LiquidityModule } from './liquidity/liquidity.module';
import { ProvidersModule } from './providers/providers.module';
import { ScopeModule } from './scope/scope.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AnalyticsModule,
    HealthModule,
    LiquidityModule,
    IngestionModule,
    ScopeModule,
    AuthModule,
    ProvidersModule,
  ],
})
export class AppModule {}
