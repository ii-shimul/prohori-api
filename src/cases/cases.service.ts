import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

type Tx = Prisma.TransactionClient;
type CaseState =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'INVESTIGATING'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED';
type Action =
  | 'acknowledge'
  | 'assign'
  | 'note'
  | 'request_verification'
  | 'escalate'
  | 'review_disposition'
  | 'resolve'
  | 'close'
  | 'reopen'
  | 'create';
const resolutionCodes = new Set([
  'VERIFIED_NORMAL_ACTIVITY',
  'DATA_QUALITY_CONFIRMED',
  'ESCALATED_TO_OPERATIONS',
  'NO_FURTHER_REVIEW_REQUIRED',
]);

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    user: AuthenticatedUser,
    filters: { state?: CaseState; outletId?: string },
  ) {
    return this.withScope(user, async (tx) => {
      const cases = await tx.case.findMany({
        where: {
          ...(filters.state ? { state: filters.state } : {}),
          ...(filters.outletId ? { outletId: filters.outletId } : {}),
        },
        orderBy: { updatedAt: 'desc' },
      });
      return cases.map(serializeCase);
    });
  }

  async detail(user: AuthenticatedUser, id: string) {
    return this.withScope(user, async (tx) =>
      serializeCase(await this.requireCase(tx, id)),
    );
  }

  async timeline(user: AuthenticatedUser, id: string) {
    return this.withScope(user, async (tx) => {
      await this.requireCase(tx, id);
      const [events, notes, auditEvents] = await Promise.all([
        tx.caseEvent.findMany({
          where: { caseId: id },
          orderBy: [{ wallAt: 'asc' }, { id: 'asc' }],
        }),
        tx.caseNote.findMany({
          where: { caseId: id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        tx.auditEvent.findMany({
          where: { targetType: 'CASE', targetId: id },
          orderBy: [{ wallAt: 'asc' }, { id: 'asc' }],
        }),
      ]);
      return {
        caseId: id,
        events: events.map((event) => ({
          ...event,
          wallAt: event.wallAt.toISOString(),
          simulatedAt: event.simulatedAt?.toISOString() ?? null,
        })),
        notes: notes.map((note) => ({
          id: note.id,
          authorUserId: note.authorUserId,
          body: note.body,
          createdAt: note.createdAt.toISOString(),
        })),
        auditEvents: auditEvents.map((event) => ({
          ...event,
          wallAt: event.wallAt.toISOString(),
          simulatedAt: event.simulatedAt?.toISOString() ?? null,
        })),
      };
    });
  }

  async createFromAlert(
    user: AuthenticatedUser,
    alertId: string,
    key: string,
    correlationId: string,
  ) {
    return this.withScope(user, async (tx) => {
      const prior = await tx.caseCommandIdempotency.findUnique({
        where: {
          actorUserId_action_idempotencyKey: {
            actorUserId: user.id,
            action: 'create',
            idempotencyKey: key,
          },
        },
      });
      if (prior) return prior.response;
      const alert = await tx.alert.findUnique({ where: { id: alertId } });
      if (!alert) throw notFound();
      await this.requireWorkflowRole(tx, user.id);
      const now = new Date();
      const created = await tx.case.create({
        data: {
          outletId: alert.outletId,
          providerId: alert.providerId,
          createdBy: user.id,
        },
      });
      await tx.caseAlertLink.create({
        data: { caseId: created.id, alertId, linkedBy: user.id },
      });
      await tx.alert.update({
        where: { id: alertId },
        data: { status: 'case_created' },
      });
      await this.record(
        tx,
        created,
        user.id,
        'CASE_CREATED',
        null,
        'OPEN',
        { alertId },
        correlationId,
        now,
      );
      const response = { case: serializeCase(created), alertId };
      await tx.caseCommandIdempotency.create({
        data: {
          actorUserId: user.id,
          action: 'create',
          idempotencyKey: key,
          caseId: created.id,
          response,
        },
      });
      return response;
    });
  }

  acknowledge(
    user: AuthenticatedUser,
    id: string,
    version: number,
    key: string,
    correlationId: string,
  ) {
    return this.command(user, id, 'acknowledge', version, key, correlationId, {
      event: 'ACKNOWLEDGED',
      allowed: ['OPEN'],
      state: 'ACKNOWLEDGED',
    });
  }
  escalate(
    user: AuthenticatedUser,
    id: string,
    version: number,
    key: string,
    correlationId: string,
  ) {
    return this.command(user, id, 'escalate', version, key, correlationId, {
      event: 'ESCALATED',
      allowed: ['INVESTIGATING'],
      state: 'ESCALATED',
    });
  }
  close(
    user: AuthenticatedUser,
    id: string,
    version: number,
    key: string,
    correlationId: string,
  ) {
    return this.command(user, id, 'close', version, key, correlationId, {
      event: 'CLOSED',
      allowed: ['RESOLVED'],
      state: 'CLOSED',
    });
  }
  reopen(
    user: AuthenticatedUser,
    id: string,
    version: number,
    key: string,
    correlationId: string,
  ) {
    return this.command(user, id, 'reopen', version, key, correlationId, {
      event: 'REOPENED',
      allowed: ['CLOSED'],
      state: 'OPEN',
      clearResolution: true,
    });
  }

  assign(
    user: AuthenticatedUser,
    id: string,
    version: number,
    assigneeUserId: string,
    key: string,
    correlationId: string,
  ) {
    return this.command(user, id, 'assign', version, key, correlationId, {
      event: 'ASSIGNED',
      allowed: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'ESCALATED'],
      ownerUserId: assigneeUserId,
      metadata: { assigneeUserId },
    });
  }
  note(
    user: AuthenticatedUser,
    id: string,
    version: number,
    body: string,
    key: string,
    correlationId: string,
  ) {
    return this.command(user, id, 'note', version, key, correlationId, {
      event: 'NOTE_ADDED',
      allowed: [
        'OPEN',
        'ACKNOWLEDGED',
        'INVESTIGATING',
        'ESCALATED',
        'RESOLVED',
      ],
      note: body,
    });
  }
  requestVerification(
    user: AuthenticatedUser,
    id: string,
    version: number,
    summary: string,
    key: string,
    correlationId: string,
  ) {
    return this.command(
      user,
      id,
      'request_verification',
      version,
      key,
      correlationId,
      {
        event: 'VERIFICATION_REQUESTED',
        allowed: ['ACKNOWLEDGED', 'INVESTIGATING'],
        state: 'INVESTIGATING',
        metadata: { summary },
      },
    );
  }
  disposition(
    user: AuthenticatedUser,
    id: string,
    version: number,
    disposition: string,
    key: string,
    correlationId: string,
  ) {
    return this.command(
      user,
      id,
      'review_disposition',
      version,
      key,
      correlationId,
      {
        event: 'DISPOSITION_RECORDED',
        allowed: ['INVESTIGATING', 'ESCALATED'],
        metadata: { disposition },
      },
    );
  }
  resolve(
    user: AuthenticatedUser,
    id: string,
    version: number,
    resolutionCode: string,
    resolutionSummary: string,
    key: string,
    correlationId: string,
  ) {
    if (!resolutionCodes.has(resolutionCode))
      throw new BadRequestException({
        code: 'INVALID_RESOLUTION_CODE',
        message: 'resolutionCode is not allowlisted.',
      });
    return this.command(user, id, 'resolve', version, key, correlationId, {
      event: 'RESOLVED',
      allowed: ['INVESTIGATING', 'ESCALATED'],
      state: 'RESOLVED',
      resolutionCode,
      resolutionSummary,
      metadata: { resolutionCode },
    });
  }

  private async command(
    user: AuthenticatedUser,
    id: string,
    action: Action,
    version: number,
    key: string,
    correlationId: string,
    input: {
      event: string;
      allowed: CaseState[];
      state?: CaseState;
      ownerUserId?: string;
      note?: string;
      metadata?: Record<string, string>;
      resolutionCode?: string;
      resolutionSummary?: string;
      clearResolution?: boolean;
    },
  ) {
    return this.withScope(user, async (tx) => {
      const prior = await tx.caseCommandIdempotency.findUnique({
        where: {
          actorUserId_action_idempotencyKey: {
            actorUserId: user.id,
            action,
            idempotencyKey: key,
          },
        },
      });
      if (prior) {
        if (prior.caseId !== id)
          throw new BadRequestException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was already used for another case.',
          });
        return prior.response;
      }
      await this.requireWorkflowRole(tx, user.id);
      const current = await this.requireCase(tx, id);
      if (!input.allowed.includes(current.state as CaseState))
        throw new BadRequestException({
          code: 'INVALID_CASE_TRANSITION',
          message: `Cannot ${action} a case in ${current.state}.`,
        });
      if (input.ownerUserId)
        await this.requireAssignee(tx, id, input.ownerUserId);
      const now = new Date();
      const state = input.state ?? current.state;
      const update = await tx.case.updateMany({
        where: { id, version },
        data: {
          state,
          version: { increment: 1 },
          ownerUserId: input.ownerUserId,
          resolutionCode: input.clearResolution ? null : input.resolutionCode,
          resolutionSummary: input.clearResolution
            ? null
            : input.resolutionSummary,
          resolvedAt: state === 'RESOLVED' ? now : undefined,
          closedAt: state === 'CLOSED' ? now : undefined,
          updatedAt: now,
        },
      });
      if (update.count !== 1)
        throw new BadRequestException({
          code: 'CASE_VERSION_CONFLICT',
          message: 'Case version is stale; refresh and retry.',
        });
      const updated = await this.requireCase(tx, id);
      if (input.note)
        await tx.caseNote.create({
          data: { caseId: id, authorUserId: user.id, body: input.note },
        });
      await this.record(
        tx,
        updated,
        user.id,
        input.event,
        current.state,
        state,
        input.metadata ?? {},
        correlationId,
        now,
      );
      const response = serializeCase(updated);
      await tx.caseCommandIdempotency.create({
        data: {
          actorUserId: user.id,
          action,
          idempotencyKey: key,
          caseId: id,
          response,
        },
      });
      return response;
    });
  }

  private async record(
    tx: Tx,
    item: { id: string; outletId: string; providerId: string | null },
    actorUserId: string,
    eventType: string,
    oldState: string | null,
    newState: string | null,
    metadata: Prisma.InputJsonValue,
    correlationId: string,
    wallAt: Date,
  ) {
    await tx.caseEvent.create({
      data: {
        caseId: item.id,
        eventType,
        actorUserId,
        oldState,
        newState,
        metadata,
        correlationId,
        wallAt,
        simulatedAt: wallAt,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId,
        actorType: 'USER',
        action: eventType,
        targetType: 'CASE',
        targetId: item.id,
        providerId: item.providerId,
        outletId: item.outletId,
        oldState,
        newState,
        safeMetadata: metadata,
        correlationId,
        wallAt,
        simulatedAt: wallAt,
      },
    });
  }

  private async requireCase(tx: Tx, id: string) {
    const item = await tx.case.findUnique({ where: { id } });
    if (!item) throw notFound();
    return item;
  }
  private async requireWorkflowRole(tx: Tx, userId: string) {
    const roles = await tx.providerMembership.findMany({
      where: { userId, isActive: true },
      select: { role: true },
    });
    if (
      !roles.some(({ role }) =>
        [
          'PROVIDER_OPERATIONS',
          'DATA_STEWARD',
          'VALIDATION_AUDITOR',
          'DEMO_ADMIN',
        ].includes(role),
      )
    )
      throw new ForbiddenException({
        code: 'CASE_ROLE_FORBIDDEN',
        message: 'Your role cannot perform case workflow commands.',
      });
  }
  private async requireAssignee(
    tx: Tx,
    caseId: string,
    assigneeUserId: string,
  ) {
    const result = await tx.$queryRaw<Array<{ allowed: boolean }>>`
      select app.case_assignee_allowed(${caseId}::uuid, ${assigneeUserId}::uuid) as allowed
    `;
    if (!result[0]?.allowed)
      throw new BadRequestException({
        code: 'INVALID_CASE_ASSIGNEE',
        message: 'Assignee must have an active scoped outlet assignment.',
      });
  }
  private async withScope<T>(
    user: AuthenticatedUser,
    operation: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`set local role app_api`;
      await tx.$executeRaw`select set_config('request.jwt.claim.sub', ${user.id}, true)`;
      await tx.$executeRaw`select set_config('request.jwt.claim.role', ${user.role}, true)`;
      return operation(tx);
    });
  }
}

function notFound() {
  return new NotFoundException({
    code: 'CASE_NOT_FOUND_OR_NOT_AUTHORIZED',
    message: 'The case was not found in your authorized scope.',
  });
}
function serializeCase(item: {
  id: string;
  outletId: string;
  providerId: string | null;
  state: string;
  version: number;
  ownerUserId: string | null;
  resolutionCode: string | null;
  resolutionSummary: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
}) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    resolvedAt: item.resolvedAt?.toISOString() ?? null,
    closedAt: item.closedAt?.toISOString() ?? null,
  };
}
