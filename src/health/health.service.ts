import { Injectable } from '@nestjs/common';

export interface LiveHealthResponse {
  service: 'prohori-api';
  status: 'ok';
}

@Injectable()
export class HealthService {
  getLiveStatus(): LiveHealthResponse {
    return {
      service: 'prohori-api',
      status: 'ok',
    };
  }
}
