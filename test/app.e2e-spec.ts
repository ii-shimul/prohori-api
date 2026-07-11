import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApplication } from './../src/main';

describe('Health endpoint (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    app = await createApplication();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('returns live status and a correlation ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: 'prohori-api',
      status: 'ok',
    });
    expect(response.headers['x-correlation-id']).toEqual(
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
  });

  it('replaces an invalid client correlation ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
      headers: { 'x-correlation-id': 'not-a-uuid' },
    });

    expect(response.headers['x-correlation-id']).toEqual(
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
    expect(response.headers['x-correlation-id']).not.toBe('not-a-uuid');
  });

  it('echoes a valid client correlation ID', async () => {
    const correlationId = '00000000-0000-4000-8000-000000000001';
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
      headers: { 'x-correlation-id': correlationId },
    });

    expect(response.headers['x-correlation-id']).toBe(correlationId);
  });

  it.each([
    '/api/v1/me',
    '/api/v1/providers',
    '/api/v1/areas',
    '/api/v1/outlets',
  ])(
    'keeps catalog route %s unavailable until auth is configured',
    async (url) => {
      const response = await app.inject({ method: 'GET', url });

      const body = JSON.parse(response.body) as {
        code: string;
        correlationId: string;
        fieldErrors: Record<string, string[]>;
        message: string;
      };

      expect(response.statusCode).toBe(503);
      expect(body).toMatchObject({
        code: 'AUTH_NOT_CONFIGURED',
        fieldErrors: {},
        message: 'Catalog access requires authentication setup from Step 3.',
      });
      expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
    },
  );

  afterEach(async () => {
    await app.close();
  });
});
