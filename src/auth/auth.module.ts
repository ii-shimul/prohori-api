import { Module } from '@nestjs/common';
import { ScopeModule } from '../scope/scope.module';
import { MeController } from './me.controller';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import { SupabaseJwtService } from './supabase-jwt.service';

@Module({
  imports: [ScopeModule],
  controllers: [MeController],
  providers: [SupabaseJwtService, SupabaseJwtGuard],
  exports: [SupabaseJwtGuard, SupabaseJwtService],
})
export class AuthModule {}
