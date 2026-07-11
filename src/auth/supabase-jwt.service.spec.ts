import { ConfigService } from '@nestjs/config';
import { SupabaseJwtService } from './supabase-jwt.service';

describe('SupabaseJwtService', () => {
  it('fails closed when SUPABASE_URL is absent', async () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const service = new SupabaseJwtService(config);

    await expect(service.verifyAccessToken('token')).rejects.toMatchObject({
      response: {
        code: 'AUTH_NOT_CONFIGURED',
      },
      status: 503,
    });
  });
});
