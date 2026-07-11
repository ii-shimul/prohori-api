import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OutletAnalyticsController } from './outlet-analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [AuthModule],
  controllers: [OutletAnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
