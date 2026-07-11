import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { CasesService } from '../cases/cases.service';

type ScopedTransaction = Prisma.TransactionClient;
type Quality = 'healthy' | 'degraded' | 'unreliable';
type AlertType =
  | 'provider_emoney_pressure'
  | 'shared_cash_pressure'
  | 'unusual_activity_review'
  | 'data_quality_issue'
  | 'combined_review';

export interface AlertForecastInput {
  dataQuality: Quality;
  forecastRunId: string;
  generatedAt: Date;
  modelConfidence: number;
  outletId: string;
  resources: Array<{
    providerId?: string;
    resource: 'shared_cash' | 'provider_efloat';
    points: Array<{ horizonMinutes: number; riskBand: string }>;
  }>;
  anomalySignals: Array<{ id: string; providerId: string; score: number }>;
  incidentCount: number;
  hasCorrelation: boolean;
}

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
  ) {}

  /** Creates/updates active review episodes from persisted analytical evidence. */
  async syncForecastAlerts(tx: ScopedTransaction, input: AlertForecastInput) {
    const window = input.generatedAt.toISOString().slice(0, 13);
    const candidates: Array<{
      type: AlertType;
      providerId?: string;
      resource?: 'shared_cash' | 'provider_efloat';
      severity: string;
      messageKey: string;
      messageParams: Prisma.InputJsonValue;
      evidenceKind: string;
      evidence: Prisma.InputJsonValue;
    }> = [];

    for (const resource of input.resources) {
      const severity = highestSeverity(
        resource.points.map((point) => point.riskBand),
      );
      if (!severity) continue;
      candidates.push({
        type:
          resource.resource === 'shared_cash'
            ? 'shared_cash_pressure'
            : 'provider_emoney_pressure',
        providerId: resource.providerId,
        resource: resource.resource,
        severity,
        messageKey:
          resource.resource === 'shared_cash'
            ? 'alerts.shared_cash_pressure.review'
            : 'alerts.provider_emoney_pressure.review',
        messageParams: {
          resource: resource.resource,
          severity,
          window,
        },
        evidenceKind: 'forecast',
        evidence: {
          forecastRunId: input.forecastRunId,
          points: resource.points,
          resource: resource.resource,
        },
      });
    }
    for (const signal of input.anomalySignals) {
      candidates.push({
        type: 'unusual_activity_review',
        providerId: signal.providerId,
        severity: signal.score >= 0.85 ? 'high' : 'moderate',
        messageKey: 'alerts.unusual_activity_review.review',
        messageParams: { window },
        evidenceKind: 'anomaly_signal',
        evidence: { anomalySignalId: signal.id, score: signal.score },
      });
    }
    if (input.incidentCount) {
      candidates.push({
        type: 'data_quality_issue',
        severity: input.dataQuality === 'unreliable' ? 'high' : 'moderate',
        messageKey: 'alerts.data_quality_issue.review',
        messageParams: { incidentCount: input.incidentCount, window },
        evidenceKind: 'data_quality_incident',
        evidence: { incidentCount: input.incidentCount },
      });
    }
    if (input.hasCorrelation) {
      candidates.push({
        type: 'combined_review',
        severity: 'high',
        messageKey: 'alerts.combined_review.review',
        messageParams: { window },
        evidenceKind: 'correlation',
        evidence: {
          forecastRunId: input.forecastRunId,
          statement:
            'Signals overlap in an evidence window and require review; this does not establish causation.',
        },
      });
    }

    for (const candidate of candidates) {
      const fingerprint = [
        candidate.type,
        input.outletId,
        candidate.providerId ?? candidate.resource ?? 'outlet',
        window,
      ].join(':');
      const alert = await tx.alert.upsert({
        where: { fingerprint },
        create: {
          active: true,
          dataQuality: input.dataQuality,
          episodeStartedAt: input.generatedAt,
          evidence: candidate.evidence,
          fingerprint,
          lastObservedAt: input.generatedAt,
          messageKey: candidate.messageKey,
          messageParams: candidate.messageParams,
          modelConfidence: input.modelConfidence,
          outletId: input.outletId,
          providerId: candidate.providerId ?? null,
          resource: candidate.resource ?? null,
          severity: candidate.severity,
          type: candidate.type,
        },
        update: {
          active: true,
          dataQuality: input.dataQuality,
          evidence: candidate.evidence,
          lastObservedAt: input.generatedAt,
          messageKey: candidate.messageKey,
          messageParams: candidate.messageParams,
          modelConfidence: input.modelConfidence,
          occurrenceCount: { increment: 1 },
          severity: candidate.severity,
          updatedAt: input.generatedAt,
        },
      });
      await tx.alertEvidenceSnapshot.create({
        data: {
          alertId: alert.id,
          kind: candidate.evidenceKind,
          observedAt: input.generatedAt,
          snapshot: candidate.evidence,
        },
      });
      await tx.$executeRaw`select app.route_alert(${alert.id}::uuid)`;
    }
  }

  async list(
    user: AuthenticatedUser,
    filters: { active?: boolean; outletId?: string; type?: AlertType },
  ) {
    return this.withScope(user, async (tx) => {
      const alerts = await tx.alert.findMany({
        where: {
          ...(filters.active === undefined ? {} : { active: filters.active }),
          ...(filters.outletId ? { outletId: filters.outletId } : {}),
          ...(filters.type ? { type: filters.type } : {}),
        },
        orderBy: [{ severity: 'desc' }, { lastObservedAt: 'desc' }],
      });
      return alerts.map(serializeAlert);
    });
  }

  async detail(user: AuthenticatedUser, id: string) {
    return this.withScope(user, async (tx) => this.getDetail(tx, id));
  }

  async acknowledge(user: AuthenticatedUser, id: string, key: string) {
    return this.action(user, id, 'acknowledge', key, async (tx) => {
      const updated = await tx.alert.update({
        where: { id },
        data: {
          acknowledgedAt: new Date(),
          acknowledgedBy: user.id,
          status: 'acknowledged',
        },
      });
      return serializeAlert(updated);
    });
  }

  async assign(
    user: AuthenticatedUser,
    id: string,
    assigneeUserId: string,
    key: string,
  ) {
    return this.action(user, id, 'assign', key, async (tx) => {
      const allowed = await tx.$queryRaw<
        Array<{ allowed: boolean }>
      >`select app.alert_recipient_allowed(${id}::uuid, ${assigneeUserId}::uuid) as allowed`;
      if (!allowed[0]?.allowed) {
        throw new BadRequestException({
          code: 'INVALID_ALERT_ASSIGNEE',
          message: 'Assignee must be in the alert routing scope.',
        });
      }
      const updated = await tx.alert.update({
        where: { id },
        data: { ownerUserId: assigneeUserId, status: 'assigned' },
      });
      return serializeAlert(updated);
    });
  }

  async createCase(
    user: AuthenticatedUser,
    id: string,
    key: string,
    correlationId: string,
  ) {
    return this.cases.createFromAlert(user, id, key, correlationId);
  }

  private async action<T>(
    user: AuthenticatedUser,
    id: string,
    action: string,
    idempotencyKey: string,
    operation: (tx: ScopedTransaction) => Promise<T>,
  ) {
    return this.withScope(user, async (tx) => {
      const alert = await tx.alert.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!alert)
        throw new NotFoundException({
          code: 'ALERT_NOT_FOUND_OR_NOT_AUTHORIZED',
          message: 'The alert was not found in your authorized scope.',
        });
      const prior = await tx.alertActionIdempotency.findUnique({
        where: {
          actorUserId_action_idempotencyKey: {
            actorUserId: user.id,
            action,
            idempotencyKey,
          },
        },
      });
      if (prior) {
        if (prior.alertId !== id)
          throw new BadRequestException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was already used for another alert.',
          });
        return prior.response as T;
      }
      const response = await operation(tx);
      await tx.alertActionIdempotency.create({
        data: {
          action,
          actorUserId: user.id,
          alertId: id,
          idempotencyKey,
          response: response as Prisma.InputJsonValue,
        },
      });
      return response;
    });
  }

  private async getDetail(tx: ScopedTransaction, id: string) {
    const alert = await tx.alert.findUnique({ where: { id } });
    if (!alert)
      throw new NotFoundException({
        code: 'ALERT_NOT_FOUND_OR_NOT_AUTHORIZED',
        message: 'The alert was not found in your authorized scope.',
      });
    const evidence = await tx.alertEvidenceSnapshot.findMany({
      where: { alertId: id },
      orderBy: { observedAt: 'desc' },
    });
    return {
      ...serializeAlert(alert),
      evidenceSnapshots: evidence.map((item) => ({
        kind: item.kind,
        observedAt: item.observedAt.toISOString(),
        snapshot: item.snapshot,
      })),
    };
  }

  private async withScope<T>(
    user: AuthenticatedUser,
    operation: (tx: ScopedTransaction) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`set local role app_api`;
      await tx.$executeRaw`select set_config('request.jwt.claim.sub', ${user.id}, true)`;
      await tx.$executeRaw`select set_config('request.jwt.claim.role', ${user.role}, true)`;
      return operation(tx);
    });
  }
}

function highestSeverity(risks: string[]): string | null {
  if (risks.includes('critical')) return 'critical';
  if (risks.includes('high')) return 'high';
  return null;
}

function serializeAlert(alert: {
  id: string;
  outletId: string;
  providerId: string | null;
  resource: string | null;
  type: string;
  severity: string;
  status: string;
  episodeStartedAt: Date;
  lastObservedAt: Date;
  occurrenceCount: number;
  messageKey: string;
  messageParams: unknown;
  evidence: unknown;
  dataQuality: string;
  modelConfidence: { toString(): string } | number;
  ownerUserId: string | null;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  active: boolean;
}) {
  return {
    id: alert.id,
    outletId: alert.outletId,
    providerId: alert.providerId,
    resource: alert.resource,
    type: alert.type,
    severity: alert.severity,
    status: alert.status,
    active: alert.active,
    episodeStartedAt: alert.episodeStartedAt.toISOString(),
    lastObservedAt: alert.lastObservedAt.toISOString(),
    occurrenceCount: alert.occurrenceCount,
    message: { key: alert.messageKey, params: alert.messageParams },
    evidence: alert.evidence,
    dataQuality: alert.dataQuality,
    modelConfidence: Number(alert.modelConfidence),
    ownerUserId: alert.ownerUserId,
    acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: alert.acknowledgedBy,
  };
}
