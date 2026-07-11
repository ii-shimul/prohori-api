import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ProvidersModule } from './providers/providers.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    ProvidersModule,
  ],
})
export class AppModule {}
