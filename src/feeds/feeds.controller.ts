import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { FeedsService, type PageQuery } from './feeds.service';

const pageQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  outletId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
});

@Controller()
@UseGuards(SupabaseJwtGuard)
export class FeedsController {
  constructor(private readonly feeds: FeedsService) {}

  @Get('feed-health')
  listFeedHealth(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ) {
    return this.feeds.listFeedHealth(user, parsePageQuery(query));
  }

  @Get('data-quality/incidents')
  listIncidents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ) {
    return this.feeds.listIncidents(user, parsePageQuery(query));
  }
}

function parsePageQuery(query: unknown): PageQuery {
  const parsed = pageQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'INVALID_FEED_QUERY',
      message:
        'limit must be 1–100; cursor, providerId, and outletId must be UUIDs when supplied.',
    });
  }
  return parsed.data;
}
