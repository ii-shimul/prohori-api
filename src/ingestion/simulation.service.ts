import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { IngestionService } from './ingestion.service';
import { IngestionBatch, ProviderCode } from './ingestion.types';
import {
  calculateBatchChecksum,
  parseIngestionBatch,
  payloadForChecksum,
} from './ingestion.validation';

export type ScenarioCode = 'A' | 'B' | 'C' | 'D';

@Injectable()
export class SimulationService {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async reset(user: AuthenticatedUser) {
    await this.assertDemoAdmin(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.liquidityAnomalyCorrelation.deleteMany();
      await tx.anomalySignal.deleteMany();
      await tx.dataQualityIncident.deleteMany();
      await tx.balanceSnapshot.deleteMany();
      await tx.transaction.deleteMany();
      await tx.feedBatch.deleteMany();
      const baselines = await tx.simulationBalanceBaseline.findMany();
      for (const baseline of baselines) {
        if (baseline.resource === 'shared_cash') {
          await tx.outletCashBalance.update({
            where: { outletId: baseline.outletId },
            data: { amountMinor: baseline.amountMinor },
          });
        } else if (baseline.providerId) {
          await tx.providerBalance.update({
            where: {
              outletId_providerId: {
                outletId: baseline.outletId,
                providerId: baseline.providerId,
              },
            },
            data: { amountMinor: baseline.amountMinor },
          });
        }
      }
      await tx.simulationState.upsert({
        where: { id: 'default' },
        create: { id: 'default', scenario: 'A', step: 0 },
        update: { scenario: 'A', step: 0 },
      });
    });
    return { status: 'reset' as const };
  }

  async start(user: AuthenticatedUser, scenario: ScenarioCode) {
    await this.reset(user);
    const receipt = await this.ingestFixture(scenario, 0);
    await this.prisma.simulationState.update({
      where: { id: 'default' },
      data: { scenario, step: 1 },
    });
    return { receipt, scenario, step: 1 };
  }

  async step(user: AuthenticatedUser, scenario: ScenarioCode) {
    await this.assertDemoAdmin(user);
    const state = await this.prisma.simulationState.findUnique({
      where: { id: 'default' },
    });
    const nextStep = state?.scenario === scenario ? state.step + 1 : 1;
    const receipt = await this.ingestFixture(scenario, nextStep - 1);
    await this.prisma.simulationState.upsert({
      where: { id: 'default' },
      create: { id: 'default', scenario, step: nextStep },
      update: { scenario, step: nextStep },
    });
    return { receipt, scenario, step: nextStep };
  }

  private async assertDemoAdmin(user: AuthenticatedUser): Promise<void> {
    if (!(await this.scope.isDemoAdmin(user))) {
      throw new ForbiddenException({
        code: 'DEMO_ADMIN_REQUIRED',
        message: 'Simulation controls require the DEMO_ADMIN role.',
      });
    }
  }

  private ingestFixture(scenario: ScenarioCode, step: number) {
    const fixture = buildScenarioFixture(scenario, step);
    return this.ingestion.ingest(fixture.provider, fixture.batch);
  }
}

export function buildScenarioFixture(
  scenario: ScenarioCode,
  step: number,
): { batch: IngestionBatch; provider: ProviderCode } {
  const provider: ProviderCode = scenario === 'B' ? 'PROVIDER_B' : 'PROVIDER_A';
  const minute = String(step).padStart(2, '0');
  const occurredAt = `2026-01-01T08:${minute}:00.000Z`;
  const receivedAt = `2026-01-01T08:${minute}:30.000Z`;
  // D starts from the same provider-pressure evidence as A so it can drive the
  // alert-to-case review lifecycle without manual database edits.
  const amountMinor =
    scenario === 'A' || scenario === 'D'
      ? 50000
      : scenario === 'B'
        ? 30000
        : 10000;
  const raw = {
    events: Array.from({ length: scenario === 'B' ? 4 : 1 }, (_, index) => ({
      amountMinor,
      eventId: `scenario-${scenario}-${step}-${index}`,
      eventVersion: 1,
      idempotencyKey: `scenario-${scenario}-${step}-${index}`,
      lifecycle: 'SETTLED',
      occurredAt:
        scenario === 'B'
          ? `2026-01-01T08:${minute}:${String(index).padStart(2, '0')}.000Z`
          : occurredAt,
      outletCode: 'DN-001',
      receivedAt,
      type: scenario === 'B' ? 'CASH_OUT' : 'CASH_IN',
    })),
    receivedAt,
    sequence: step + 1,
    snapshots:
      scenario === 'C'
        ? [
            {
              amountMinor: 1,
              observedAt: occurredAt,
              outletCode: 'DN-001',
              resource: 'provider_efloat',
            },
          ]
        : [],
    sourceAt: scenario === 'C' ? '2026-01-01T07:00:00.000Z' : occurredAt,
  };
  const batch = parseIngestionBatch({
    ...raw,
    checksum: calculateBatchChecksum(raw),
  });
  // Keep checksum generation coupled to the public canonical-payload definition.
  batch.checksum = calculateBatchChecksum(payloadForChecksum(batch));
  return { batch, provider };
}
