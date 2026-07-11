import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FeedsController } from './feeds.controller';
import { FeedsService } from './feeds.service';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [AuthModule],
  controllers: [FeedsController, ReadinessController],
  providers: [FeedsService, ReadinessService],
})
export class FeedsModule {}
