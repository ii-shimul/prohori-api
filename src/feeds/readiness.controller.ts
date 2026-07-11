import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { ReadinessService } from './readiness.service';

@Controller('management')
@UseGuards(SupabaseJwtGuard)
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('readiness')
  getReadiness(@CurrentUser() user: AuthenticatedUser) {
    return this.readiness.get(user);
  }
}
