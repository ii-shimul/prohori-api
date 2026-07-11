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

  it('rejects /me without a bearer access token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/me' });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'MISSING_ACCESS_TOKEN',
    });
  });

  it.each([
    '/api/v1/outlets/30000000-0000-4000-8000-000000000001/health',
    '/api/v1/outlets/30000000-0000-4000-8000-000000000001/balances',
    '/api/v1/outlets/30000000-0000-4000-8000-000000000001/forecasts',
    '/api/v1/outlets/30000000-0000-4000-8000-000000000001/anomalies',
    '/api/v1/outlets/30000000-0000-4000-8000-000000000001/data-quality',
    '/api/v1/outlets/30000000-0000-4000-8000-000000000001/transactions',
  ])('rejects unauthenticated outlet analytics route %s', async (url) => {
    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'MISSING_ACCESS_TOKEN',
    });
  });

  it.each([
    '/api/v1/alerts',
    '/api/v1/alerts/90000000-0000-4000-8000-000000000001',
  ])('rejects unauthenticated alert route %s', async (url) => {
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'MISSING_ACCESS_TOKEN',
    });
  });

  it.each([
    '/api/v1/cases',
    '/api/v1/cases/60000000-0000-4000-8000-000000000001',
    '/api/v1/cases/60000000-0000-4000-8000-000000000001/timeline',
  ])('rejects unauthenticated case route %s', async (url) => {
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'MISSING_ACCESS_TOKEN',
    });
  });

  it.each([
    '/api/v1/providers',
    '/api/v1/areas',
    '/api/v1/outlets',
    '/api/v1/feed-health',
    '/api/v1/data-quality/incidents',
    '/api/v1/management/readiness',
  ])('rejects unauthenticated scoped read route %s', async (url) => {
    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'MISSING_ACCESS_TOKEN',
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
