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
import { CasesService } from './cases.service';

const id = z.string().uuid();
const version = z.object({ version: z.number().int().positive() });
const note = version.extend({ body: z.string().trim().min(1).max(4000) });
const assign = version.extend({ assigneeUserId: id });
const summary = version.extend({ summary: z.string().trim().min(1).max(1000) });
const disposition = version.extend({
  disposition: z.string().trim().min(1).max(1000),
});
const resolve = version.extend({
  resolutionCode: z.enum([
    'VERIFIED_NORMAL_ACTIVITY',
    'DATA_QUALITY_CONFIRMED',
    'ESCALATED_TO_OPERATIONS',
    'NO_FURTHER_REVIEW_REQUIRED',
  ]),
  resolutionSummary: z.string().trim().min(1).max(2000),
});
const query = z.object({
  state: z
    .enum([
      'OPEN',
      'ACKNOWLEDGED',
      'INVESTIGATING',
      'ESCALATED',
      'RESOLVED',
      'CLOSED',
    ])
    .optional(),
  outletId: id.optional(),
});

@Controller('cases')
@UseGuards(SupabaseJwtGuard)
export class CasesController {
  constructor(private readonly cases: CasesService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() value: unknown) {
    const parsed = query.safeParse(value);
    if (!parsed.success)
      throw invalid('INVALID_CASE_QUERY', 'Case filters are invalid.');
    return this.cases.list(user, parsed.data);
  }
  @Get(':id') detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') caseId: string,
  ) {
    return this.cases.detail(user, parseId(caseId));
  }
  @Get(':id/timeline') timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') caseId: string,
  ) {
    return this.cases.timeline(user, parseId(caseId));
  }
  @Post(':id/acknowledge') acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    const data = parse(version, body);
    return this.cases.acknowledge(
      user,
      parseId(caseId),
      data.version,
      parseKey(key),
      parseCorrelation(correlationId),
    );
  }
  @Post(':id/assign') assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    const data = parse(assign, body);
    return this.cases.assign(
      user,
      parseId(caseId),
      data.version,
      data.assigneeUserId,
      parseKey(key),
      parseCorrelation(correlationId),
    );
  }
  @Post(':id/notes') note(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    const data = parse(note, body);
    return this.cases.note(
      user,
      parseId(caseId),
      data.version,
      data.body,
      parseKey(key),
      parseCorrelation(correlationId),
    );
  }
  @Post(':id/request-verification') verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    const data = parse(summary, body);
    return this.cases.requestVerification(
      user,
      parseId(caseId),
      data.version,
      data.summary,
      parseKey(key),
      parseCorrelation(correlationId),
    );
  }
  @Post(':id/escalate') escalate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    const data = parse(version, body);
    return this.cases.escalate(
      user,
      parseId(caseId),
      data.version,
      parseKey(key),
      parseCorrelation(correlationId),
    );
  }
  @Post(':id/disposition') disposition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    const data = parse(disposition, body);
    return this.cases.disposition(
      user,
      parseId(caseId),
      data.version,
      data.disposition,
      parseKey(key),
      parseCorrelation(correlationId),
    );
  }
  @Post(':id/resolve') resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    const data = parse(resolve, body);
    return this.cases.resolve(
      user,
      parseId(caseId),
      data.version,
      data.resolutionCode,
      data.resolutionSummary,
      parseKey(key),
      parseCorrelation(correlationId),
    );
  }
  @Post(':id/close') close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    const data = parse(version, body);
    return this.cases.close(
      user,
      parseId(caseId),
      data.version,
      parseKey(key),
      parseCorrelation(correlationId),
    );
  }
  @Post(':id/reopen') reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    const data = parse(version, body);
    return this.cases.reopen(
      user,
      parseId(caseId),
      data.version,
      parseKey(key),
      parseCorrelation(correlationId),
    );
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw invalid('INVALID_CASE_COMMAND', 'Case command body is invalid.');
  return parsed.data;
}
function parseId(value: string) {
  if (!id.safeParse(value).success)
    throw invalid('INVALID_CASE_ID', 'Case id must be a UUID.');
  return value;
}
function parseKey(value: string | undefined) {
  if (!value || value.length > 200)
    throw invalid(
      'MISSING_IDEMPOTENCY_KEY',
      'Idempotency-Key is required and must be at most 200 characters.',
    );
  return value;
}
function parseCorrelation(value: string | undefined) {
  if (!value || !id.safeParse(value).success)
    throw invalid(
      'INVALID_CORRELATION_ID',
      'A valid correlation ID is required.',
    );
  return value;
}
function invalid(code: string, message: string) {
  return new BadRequestException({ code, message });
}
