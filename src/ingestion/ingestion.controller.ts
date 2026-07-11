import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { parseIngestionBatch } from './ingestion.validation';
import { ProviderIngestAuthService } from './provider-ingest-auth.service';

@Controller('ingestion/providers')
export class IngestionController {
  constructor(
    private readonly auth: ProviderIngestAuthService,
    private readonly ingestion: IngestionService,
  ) {}

  @Post(':provider/batches')
  async ingest(
    @Param('provider') provider: string,
    @Headers('x-provider-ingest-key') credential: string | undefined,
    @Body() body: unknown,
  ) {
    const authenticatedProvider = this.auth.authenticate(provider, credential);
    return this.ingestion.ingest(
      authenticatedProvider,
      parseIngestionBatch(body),
    );
  }
}
