import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { OutletAnalyticsController } from './outlet-analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [AuthModule, AlertsModule],
  controllers: [OutletAnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
