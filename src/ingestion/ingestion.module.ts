import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScopeModule } from '../scope/scope.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { ProviderIngestAuthService } from './provider-ingest-auth.service';
import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';

@Module({
  imports: [AuthModule, ScopeModule],
  controllers: [IngestionController, SimulationController],
  providers: [IngestionService, ProviderIngestAuthService, SimulationService],
  exports: [IngestionService],
})
export class IngestionModule {}
