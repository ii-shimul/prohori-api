import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  DataQuality,
  LiquidityForecast,
  forecastLiquidity,
} from './liquidity-forecast';
import {
  ANOMALY_DETECTOR_VERSION,
  detectUnusualActivity,
} from './anomaly-detector';

export interface TransactionPage {
  items: Array<{
    amountMinor: string;
    id: string;
    lifecycle: string;
    occurredAt: string;
    provider: { code: string; id: string; name: string };
    type: string;
  }>;
  nextCursor: string | null;
}

type ScopedTransaction = Prisma.TransactionClient;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalances(user: AuthenticatedUser, outletId: string) {
    return this.withScope(user, async (tx) => {
      await this.assertOutlet(tx, outletId);
      const [cash, providerBalances] = await Promise.all([
        tx.outletCashBalance.findUniqueOrThrow({ where: { outletId } }),
        tx.providerBalance.findMany({
          where: { outletId },
          include: {
            provider: { select: { code: true, id: true, name: true } },
          },
          orderBy: { providerId: 'asc' },
        }),
      ]);
      return {
        outletId,
        sharedCash: {
          amountMinor: cash.amountMinor.toString(),
          resource: 'shared_cash',
        },
        providerEMoney: providerBalances.map((balance) => ({
          amountMinor: balance.amountMinor.toString(),
          provider: balance.provider,
          resource: 'provider_efloat' as const,
        })),
      };
    });
  }

  async getHealth(user: AuthenticatedUser, outletId: string) {
    const run = await this.createForecast(user, outletId);
    return {
      dataQuality: run.dataQuality,
      limitingResource: run.limitingResource,
      modelConfidence: run.modelConfidence,
      outletId,
      forecastRunId: run.id,
      unusualActivity: await this.listAnomaliesInScope(user, outletId),
    };
  }

  async getForecasts(user: AuthenticatedUser, outletId: string) {
    return this.createForecast(user, outletId);
  }

  async getAnomalies(user: AuthenticatedUser, outletId: string) {
    await this.createForecast(user, outletId);
    return this.listAnomaliesInScope(user, outletId);
  }

  async getDataQuality(user: AuthenticatedUser, outletId: string) {
    return this.withScope(user, async (tx) => {
      await this.assertOutlet(tx, outletId);
      const incidents = await tx.dataQualityIncident.findMany({
        where: { outletId, resolvedAt: null },
        orderBy: { detectedAt: 'desc' },
      });
      return {
        dataQuality: deriveDataQuality(
          incidents.map((incident) => incident.category),
        ),
        incidents: incidents.map((incident) => ({
          category: incident.category,
          detectedAt: incident.detectedAt.toISOString(),
          details: incident.details,
          id: incident.id,
          providerId: incident.providerId,
        })),
        outletId,
      };
    });
  }

  async getTransactions(
    user: AuthenticatedUser,
    outletId: string,
    limit: number,
    cursor?: string,
  ): Promise<TransactionPage> {
    return this.withScope(user, async (tx) => {
      await this.assertOutlet(tx, outletId);
      const transactions = await tx.transaction.findMany({
        where: { outletId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { provider: { select: { code: true, id: true, name: true } } },
      });
      const hasMore = transactions.length > limit;
      const page = transactions.slice(0, limit);
      return {
        items: page.map((transaction) => ({
          amountMinor: transaction.amountMinor.toString(),
          id: transaction.id,
          lifecycle: transaction.lifecycle,
          occurredAt: transaction.occurredAt.toISOString(),
          provider: transaction.provider,
          type: transaction.type,
        })),
        nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  private async createForecast(user: AuthenticatedUser, outletId: string) {
    return this.withScope(user, async (tx) => {
      await this.assertOutlet(tx, outletId);
      const [cash, providerBalances, transactions, incidents] =
        await Promise.all([
          tx.outletCashBalance.findUniqueOrThrow({ where: { outletId } }),
          tx.providerBalance.findMany({
            where: { outletId },
            include: {
              provider: { select: { code: true, id: true, name: true } },
            },
            orderBy: { providerId: 'asc' },
          }),
          tx.transaction.findMany({
            where: { outletId },
            select: {
              amountMinor: true,
              occurredAt: true,
              providerId: true,
              id: true,
              lifecycle: true,
              type: true,
            },
            orderBy: { occurredAt: 'asc' },
          }),
          tx.dataQualityIncident.findMany({
            where: { outletId, resolvedAt: null },
            select: {
              category: true,
              detectedAt: true,
              id: true,
              providerId: true,
            },
            orderBy: { detectedAt: 'desc' },
          }),
        ]);
      const dataQuality = deriveDataQuality(
        incidents.map((incident) => incident.category),
      );
      // Scenario and seed events use fixed synthetic time; anchor the run to the
      // newest stored event so rolling demand remains deterministic across runs.
      const generatedAt = transactions.at(-1)?.occurredAt ?? new Date();
      const forecast = forecastLiquidity({
        dataQuality,
        generatedAt,
        history: transactions,
        resources: [
          { currentMinor: cash.amountMinor, resource: 'shared_cash' },
          ...providerBalances.map((balance) => ({
            currentMinor: balance.amountMinor,
            providerId: balance.providerId,
            resource: 'provider_efloat' as const,
          })),
        ],
      });
      const response = serializeForecast(forecast, generatedAt, outletId);
      const run = await tx.forecastRun.create({
        data: {
          dataQuality,
          evidence: {
            activeIncidents: incidents.map((incident) => ({
              category: incident.category,
              detectedAt: incident.detectedAt.toISOString(),
              id: incident.id,
              providerId: incident.providerId,
            })),
            historyCount: transactions.length,
            historyWindowMinutes: 240,
          },
          generatedAt,
          limitingResource: forecast.limitingResource
            ? resourceLabel(
                forecast.limitingResource.resource,
                forecast.limitingResource.providerId,
              )
            : null,
          modelConfidence: forecast.modelConfidence,
          outletId,
          output: response,
        },
      });
      await tx.forecastPoint.createMany({
        data: forecast.resources.flatMap((resource) =>
          resource.points.map((point) => ({
            forecastRunId: run.id,
            horizonMinutes: point.horizonMinutes,
            likelyDepletionEtaMinutes: point.likelyDepletionEtaMinutes,
            projectedHighMinor: point.projectedHighMinor,
            projectedLowMinor: point.projectedLowMinor,
            projectedMidMinor: point.projectedMidMinor,
            providerId: resource.providerId ?? null,
            reserveEtaMinutes: point.reserveEtaMinutes,
            resource: resource.resource,
            riskBand: point.riskBand,
          })),
        ),
      });
      await this.persistAnomalySignals(tx, {
        dataQuality,
        forecast,
        forecastRunId: run.id,
        generatedAt,
        outletId,
        transactions,
      });
      return { ...response, id: run.id };
    });
  }

  private async listAnomaliesInScope(
    user: AuthenticatedUser,
    outletId: string,
  ) {
    return this.withScope(user, async (tx) => {
      await this.assertOutlet(tx, outletId);
      const signals = await tx.anomalySignal.findMany({
        where: { outletId },
        include: {
          correlation: true,
          provider: { select: { code: true, id: true, name: true } },
        },
        orderBy: [{ evidenceWindowEnd: 'desc' }, { detectorType: 'asc' }],
      });
      return signals.map((signal) => ({
        baselineValue: Number(signal.baselineValue),
        correlation: signal.correlation
          ? {
              context: signal.correlation.context,
              score: Number(signal.correlation.correlationScore),
              threshold: Number(signal.correlation.correlationThreshold),
            }
          : null,
        dataQuality: signal.dataQuality,
        detectorType: signal.detectorType,
        detectorVersion: signal.detectorVersion,
        evidenceWindow: {
          end: signal.evidenceWindowEnd.toISOString(),
          start: signal.evidenceWindowStart.toISOString(),
        },
        id: signal.id,
        message: 'Unusual activity requires review.',
        modelConfidence: Number(signal.modelConfidence),
        observedValue: Number(signal.observedValue),
        possibleBenignExplanation: signal.possibleBenignExplanation,
        provider: signal.provider,
        score: Number(signal.score),
        sourceTransactionIds: signal.sourceTransactionIds,
        threshold: Number(signal.threshold),
      }));
    });
  }

  private async persistAnomalySignals(
    tx: ScopedTransaction,
    input: {
      dataQuality: DataQuality;
      forecast: LiquidityForecast;
      forecastRunId: string;
      generatedAt: Date;
      outletId: string;
      transactions: Array<{
        amountMinor: bigint;
        id: string;
        lifecycle: string;
        occurredAt: Date;
        providerId: string;
        type: 'CASH_IN' | 'CASH_OUT';
      }>;
    },
  ) {
    const providerIds = [
      ...new Set(
        input.transactions.map((transaction) => transaction.providerId),
      ),
    ];
    const candidates = providerIds.flatMap((providerId) =>
      detectUnusualActivity({
        dataQuality: input.dataQuality,
        generatedAt: input.generatedAt,
        history: input.transactions,
        modelConfidence: input.forecast.modelConfidence,
        providerId,
      }).map((candidate) => ({ ...candidate, providerId })),
    );
    if (!candidates.length) return;

    await tx.anomalySignal.createMany({
      data: candidates.map((candidate) => ({
        baselineValue: candidate.baselineValue,
        dataQuality: candidate.dataQuality,
        detectorType: candidate.detectorType,
        detectorVersion: ANOMALY_DETECTOR_VERSION,
        evidenceWindowEnd: candidate.evidenceWindowEnd,
        evidenceWindowStart: candidate.evidenceWindowStart,
        modelConfidence: candidate.modelConfidence,
        observedValue: candidate.observedValue,
        outletId: input.outletId,
        possibleBenignExplanation: candidate.possibleBenignExplanation,
        providerId: candidate.providerId,
        score: candidate.score,
        sourceTransactionIds: candidate.sourceTransactionIds,
        threshold: candidate.threshold,
      })),
      skipDuplicates: true,
    });

    const sharedCashRisk =
      input.forecast.resources
        .find((resource) => resource.resource === 'shared_cash')
        ?.points.reduce(
          (highest, point) => Math.max(highest, riskValue(point.riskBand)),
          0,
        ) ?? 0;
    if (sharedCashRisk < 0.85) return;
    const signals = await tx.anomalySignal.findMany({
      where: {
        detectorVersion: ANOMALY_DETECTOR_VERSION,
        evidenceWindowEnd: input.generatedAt,
        outletId: input.outletId,
      },
      select: { id: true, score: true },
    });
    for (const signal of signals) {
      const correlationScore = Math.min(sharedCashRisk, Number(signal.score));
      if (correlationScore >= 0.75) {
        await tx.liquidityAnomalyCorrelation.createMany({
          data: [
            {
              anomalySignalId: signal.id,
              context:
                'Shared-cash liquidity pressure and unusual activity overlap in the same deterministic evidence window. This correlation does not establish causation.',
              correlationScore,
              correlationThreshold: 0.75,
              forecastRunId: input.forecastRunId,
            },
          ],
          skipDuplicates: true,
        });
      }
    }
  }

  private async assertOutlet(
    tx: ScopedTransaction,
    outletId: string,
  ): Promise<void> {
    const outlet = await tx.outlet.findUnique({
      where: { id: outletId },
      select: { id: true },
    });
    if (!outlet) {
      throw new NotFoundException({
        code: 'OUTLET_NOT_FOUND_OR_NOT_AUTHORIZED',
        message: 'The outlet was not found in your authorized scope.',
      });
    }
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

export function deriveDataQuality(categories: string[]): DataQuality {
  if (
    categories.some((category) =>
      [
        'CONFLICTING_SNAPSHOT',
        'BALANCE_MISMATCH',
        'OUT_OF_ORDER_SEQUENCE',
      ].includes(category),
    )
  ) {
    return 'unreliable';
  }
  if (categories.length > 0) return 'degraded';
  return 'healthy';
}

function serializeForecast(
  forecast: LiquidityForecast,
  generatedAt: Date,
  outletId: string,
) {
  return {
    dataQuality: forecast.dataQuality,
    generatedAt: generatedAt.toISOString(),
    limitingResource: forecast.limitingResource
      ? {
          providerId: forecast.limitingResource.providerId ?? null,
          resource: forecast.limitingResource.resource,
        }
      : null,
    modelConfidence: forecast.modelConfidence,
    outletId,
    resources: forecast.resources.map((resource) => ({
      currentMinor: resource.currentMinor.toString(),
      demandRateMinorPerMinute: resource.demandRateMinorPerMinute,
      providerId: resource.providerId ?? null,
      resource: resource.resource,
      points: resource.points.map((point) => ({
        ...point,
        projectedHighMinor: point.projectedHighMinor.toString(),
        projectedLowMinor: point.projectedLowMinor.toString(),
        projectedMidMinor: point.projectedMidMinor.toString(),
      })),
    })),
  };
}

function riskValue(risk: string): number {
  return { critical: 1, high: 0.85, low: 0, moderate: 0.5 }[risk] ?? 0;
}

function resourceLabel(resource: string, providerId?: string): string {
  return providerId ? `${resource}:${providerId}` : resource;
}
