import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { ProviderCode } from './ingestion.types';

@Injectable()
export class ProviderIngestAuthService {
  constructor(private readonly config: ConfigService) {}

  authenticate(
    pathProvider: string,
    credential: string | undefined,
  ): ProviderCode {
    if (!isProviderCode(pathProvider)) {
      throw new UnauthorizedException({
        code: 'UNKNOWN_PROVIDER',
        message: 'The provider path is not recognized.',
      });
    }
    const expected = this.config.get<string>(`INGESTION_${pathProvider}_KEY`);
    if (!expected) {
      throw new ServiceUnavailableException({
        code: 'INGESTION_NOT_CONFIGURED',
        message: 'Provider ingestion credentials are not configured.',
      });
    }
    if (!credential || !safeEqual(expected, credential)) {
      throw new UnauthorizedException({
        code: 'INVALID_PROVIDER_CREDENTIAL',
        message: 'The provider ingestion credential is invalid for this path.',
      });
    }
    return pathProvider;
  }
}

function isProviderCode(value: string): value is ProviderCode {
  return ['PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C'].includes(value);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
