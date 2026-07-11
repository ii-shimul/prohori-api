import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { AnalyticsService } from './analytics.service';

const outletIdSchema = z.string().uuid();
const transactionsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

@Controller('outlets')
@UseGuards(SupabaseJwtGuard)
export class OutletAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get(':id/health')
  getHealth(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.analytics.getHealth(user, parseOutletId(id));
  }

  @Get(':id/balances')
  getBalances(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.analytics.getBalances(user, parseOutletId(id));
  }

  @Get(':id/forecasts')
  getForecasts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.analytics.getForecasts(user, parseOutletId(id));
  }

  @Get(':id/transactions')
  getTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const parsed = transactionsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_TRANSACTION_QUERY',
        message: 'limit must be 1–100 and cursor must be a UUID when supplied.',
      });
    }
    return this.analytics.getTransactions(
      user,
      parseOutletId(id),
      parsed.data.limit,
      parsed.data.cursor,
    );
  }
}

function parseOutletId(value: string): string {
  const parsed = outletIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'INVALID_OUTLET_ID',
      message: 'Outlet id must be a UUID.',
    });
  }
  return parsed.data;
}
