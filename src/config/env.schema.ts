import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
  SUPABASE_JWT_ISSUER: z.string().url().optional(),
  CORS_ORIGIN: z
    .string()
    .url()
    .refine(
      (value) => value !== '*',
      'CORS_ORIGIN must name an explicit origin',
    )
    .default('http://localhost:3000'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose'])
    .default('log'),
  INGESTION_PROVIDER_A_KEY: z.string().min(1).optional(),
  INGESTION_PROVIDER_B_KEY: z.string().min(1).optional(),
  INGESTION_PROVIDER_C_KEY: z.string().min(1).optional(),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  return environmentSchema.parse(config);
}
