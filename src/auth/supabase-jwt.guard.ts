import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from './auth.types';
import { SupabaseJwtService } from './supabase-jwt.service';

type AuthenticatedRequest = FastifyRequest & { user: AuthenticatedUser };

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(private readonly jwtService: SupabaseJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = getBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException({
        code: 'MISSING_ACCESS_TOKEN',
        message: 'A Supabase bearer access token is required.',
      });
    }

    request.user = await this.jwtService.verifyAccessToken(token);
    return true;
  }
}

function getBearerToken(header: string | undefined): string | undefined {
  const match = header?.match(/^Bearer ([^\s]+)$/i);
  return match?.[1];
}
