import { Controller, Get, UseGuards } from '@nestjs/common';
import { ScopeService } from '../scope/scope.service';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser, CurrentUserResponse } from './auth.types';
import { SupabaseJwtGuard } from './supabase-jwt.guard';

@Controller('me')
@UseGuards(SupabaseJwtGuard)
export class MeController {
  constructor(private readonly scopeService: ScopeService) {}

  @Get()
  getCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CurrentUserResponse> {
    return this.scopeService.getCurrentUser(user);
  }
}
