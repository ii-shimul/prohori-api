import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { AlertsService } from './alerts.service';

const idSchema = z.string().uuid();
const listQuerySchema = z.object({
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  outletId: z.string().uuid().optional(),
  type: z
    .enum([
      'provider_emoney_pressure',
      'shared_cash_pressure',
      'unusual_activity_review',
      'data_quality_issue',
      'combined_review',
    ])
    .optional(),
});
const assignBodySchema = z.object({ assigneeUserId: z.string().uuid() });

@Controller('alerts')
@UseGuards(SupabaseJwtGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success)
      throw invalid('INVALID_ALERT_QUERY', 'Alert filters are invalid.');
    return this.alerts.list(user, parsed.data);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.alerts.detail(user, parseId(id));
  }

  @Post(':id/acknowledge')
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.alerts.acknowledge(user, parseId(id), parseKey(key));
  }

  @Post(':id/assign')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    const parsed = assignBodySchema.safeParse(body);
    if (!parsed.success)
      throw invalid(
        'INVALID_ALERT_ASSIGNMENT',
        'assigneeUserId must be a UUID.',
      );
    return this.alerts.assign(
      user,
      parseId(id),
      parsed.data.assigneeUserId,
      parseKey(key),
    );
  }

  @Post(':id/create-case')
  createCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    return this.alerts.createCase(
      user,
      parseId(id),
      parseKey(key),
      parseCorrelation(correlationId),
    );
  }
}

function parseId(value: string): string {
  if (!idSchema.safeParse(value).success)
    throw invalid('INVALID_ALERT_ID', 'Alert id must be a UUID.');
  return value;
}
function parseKey(value: string | undefined): string {
  if (!value || value.length > 200)
    throw invalid(
      'MISSING_IDEMPOTENCY_KEY',
      'Idempotency-Key is required and must be at most 200 characters.',
    );
  return value;
}
function parseCorrelation(value: string | undefined): string {
  if (!value || !idSchema.safeParse(value).success)
    throw invalid(
      'INVALID_CORRELATION_ID',
      'A valid correlation ID is required.',
    );
  return value;
}
function invalid(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}
