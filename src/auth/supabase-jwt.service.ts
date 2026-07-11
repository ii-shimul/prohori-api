import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedUser } from './auth.types';

@Injectable()
export class SupabaseJwtService {
  constructor(private readonly config: ConfigService) {}

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    if (!supabaseUrl) {
      throw new ServiceUnavailableException({
        code: 'AUTH_NOT_CONFIGURED',
        message:
          'SUPABASE_URL must be configured before authentication is enabled.',
      });
    }

    try {
      const { createRemoteJWKSet, jwtVerify } = await import('jose');
      const { payload } = await jwtVerify(
        token,
        createRemoteJWKSet(
          new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
        ),
        {
          algorithms: ['ES256', 'RS256'],
          audience: this.config.get<string>('SUPABASE_JWT_AUDIENCE'),
          issuer:
            this.config.get<string>('SUPABASE_JWT_ISSUER') ??
            `${supabaseUrl}/auth/v1`,
        },
      );

      if (!isUuid(payload.sub) || payload.role !== 'authenticated') {
        throw new UnauthorizedException({
          code: 'INVALID_ACCESS_TOKEN',
          message:
            'Access token does not contain required authenticated claims.',
        });
      }

      return { id: payload.sub, role: 'authenticated' };
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Access token is invalid or expired.',
      });
    }
  }
}

function isUuid(value: string | undefined): value is string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value ?? '',
  );
}
