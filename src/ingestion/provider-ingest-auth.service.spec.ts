import { ConfigService } from '@nestjs/config';
import { ProviderIngestAuthService } from './provider-ingest-auth.service';

describe('ProviderIngestAuthService', () => {
  const config = { get: jest.fn() } as unknown as ConfigService;
  const service = new ProviderIngestAuthService(config);

  beforeEach(() => jest.clearAllMocks());

  it.each(['PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C'] as const)(
    'accepts only %s own credential',
    (provider) => {
      (config.get as jest.Mock).mockImplementation((key: string) =>
        key === `INGESTION_${provider}_KEY`
          ? `${provider}-secret`
          : 'another-secret',
      );
      expect(service.authenticate(provider, `${provider}-secret`)).toBe(
        provider,
      );
    },
  );

  it('denies a credential used against another provider path', () => {
    (config.get as jest.Mock).mockImplementation((key: string) =>
      key === 'INGESTION_PROVIDER_B_KEY' ? 'b-secret' : 'a-secret',
    );
    expect(() => service.authenticate('PROVIDER_B', 'a-secret')).toThrow(
      'invalid',
    );
  });
});
