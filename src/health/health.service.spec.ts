import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns live status for the API', () => {
    expect(new HealthService().getLiveStatus()).toEqual({
      service: 'prohori-api',
      status: 'ok',
    });
  });
});
