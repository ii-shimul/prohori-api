import { validateEnvironment } from './env.schema';

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
});
