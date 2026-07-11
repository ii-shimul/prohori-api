import { Module } from '@nestjs/common';
import { AlertsModule } from './alerts/alerts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { CasesModule } from './cases/cases.module';
import { DatabaseModule } from './database/database.module';
import { FeedsModule } from './feeds/feeds.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { LiquidityModule } from './liquidity/liquidity.module';
import { ProvidersModule } from './providers/providers.module';
import { ScopeModule } from './scope/scope.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    FeedsModule,
    AnalyticsModule,
    AlertsModule,
    CasesModule,
    HealthModule,
    LiquidityModule,
    IngestionModule,
    ScopeModule,
    AuthModule,
    ProvidersModule,
  ],
})
export class AppModule {}
