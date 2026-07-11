import { getAllowedCorsOrigins, validateEnvironment } from './env.schema';

describe('validateEnvironment', () => {
  it('accepts a hosted Supabase project URL', () => {
    expect(
      validateEnvironment({
        SUPABASE_URL: 'https://project-ref.supabase.co',
      }).SUPABASE_URL,
    ).toBe('https://project-ref.supabase.co');
  });

  it('rejects an invalid Supabase project URL', () => {
    expect(() => validateEnvironment({ SUPABASE_URL: 'not-a-url' })).toThrow();
  });

  it('accepts a comma-separated explicit CORS allowlist', () => {
    const environment = validateEnvironment({
      CORS_ORIGINS: 'http://localhost:3001, http://127.0.0.1:3001',
    });

    expect(getAllowedCorsOrigins(environment)).toEqual([
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ]);
  });

  it('rejects a wildcard or malformed CORS allowlist entry', () => {
    expect(() => validateEnvironment({ CORS_ORIGINS: '*' })).toThrow();
    expect(() =>
      validateEnvironment({ CORS_ORIGINS: 'http://localhost:3001,not-a-url' }),
    ).toThrow();
  });
});
