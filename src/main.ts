import cors from '@fastify/cors';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppModule } from './app.module';

export async function createApplication(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  const config = app.get(ConfigService);

  await app.register(cors, {
    origin: config.getOrThrow<string>('CORS_ORIGIN'),
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      const header = request.headers['x-correlation-id'];
      const correlationId = Array.isArray(header) ? header[0] : header;
      const value = isUuid(correlationId) ? correlationId : randomUUID();

      request.headers['x-correlation-id'] = value;
      reply.header('x-correlation-id', value);
      done();
    });

  return app;
}

function isUuid(value: string | undefined): value is string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value ?? '',
  );
}

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const port = config.getOrThrow<number>('PORT');

  app.enableShutdownHooks();
  await app.listen({ host: '0.0.0.0', port });
  logger.log(`API listening on port ${port}`);
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
