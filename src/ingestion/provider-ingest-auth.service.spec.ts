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

  it.each([
    ['PROVIDER_A', 'PROVIDER_B'],
    ['PROVIDER_A', 'PROVIDER_C'],
    ['PROVIDER_B', 'PROVIDER_A'],
    ['PROVIDER_B', 'PROVIDER_C'],
    ['PROVIDER_C', 'PROVIDER_A'],
    ['PROVIDER_C', 'PROVIDER_B'],
  ] as const)(
    'denies %s credential on the %s path',
    (credentialProvider, pathProvider) => {
      (config.get as jest.Mock).mockImplementation(
        (key: string) => `${key}-secret`,
      );
      expect(() =>
        service.authenticate(
          pathProvider,
          `INGESTION_${credentialProvider}_KEY-secret`,
        ),
      ).toThrow('invalid');
    },
  );
});
