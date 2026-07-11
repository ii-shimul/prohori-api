export const FORECAST_HORIZONS_MINUTES = [30, 60, 120, 240] as const;

export type DataQuality = 'healthy' | 'degraded' | 'unreliable';
export type ResourceKind = 'shared_cash' | 'provider_efloat';
export type RiskBand = 'low' | 'moderate' | 'high' | 'critical';

export interface ForecastTransaction {
  amountMinor: bigint;
  occurredAt: Date;
  providerId: string;
  type: 'CASH_IN' | 'CASH_OUT';
  lifecycle: 'PENDING' | 'SETTLED' | 'FAILED' | 'REVERSED';
}

export interface ForecastResourceInput {
  currentMinor: bigint;
  providerId?: string;
  resource: ResourceKind;
}

export interface ForecastInput {
  generatedAt: Date;
  history: ForecastTransaction[];
  resources: ForecastResourceInput[];
  dataQuality: DataQuality;
}

export interface ForecastPoint {
  horizonMinutes: (typeof FORECAST_HORIZONS_MINUTES)[number];
  projectedHighMinor: bigint;
  projectedLowMinor: bigint;
  projectedMidMinor: bigint;
  riskBand: RiskBand;
  reserveEtaMinutes: number | null;
  likelyDepletionEtaMinutes: number | null;
}

export interface ResourceForecast {
  currentMinor: bigint;
  demandRateMinorPerMinute: number;
  points: ForecastPoint[];
  providerId?: string;
  resource: ResourceKind;
}

export interface LiquidityForecast {
  dataQuality: DataQuality;
  limitingResource: { providerId?: string; resource: ResourceKind } | null;
  modelConfidence: number;
  resources: ResourceForecast[];
}

const HISTORY_WINDOW_MINUTES = 240;
const MIN_RESERVE_MINOR = 100_000n;

/**
 * Deterministic, explainable liquidity projection. Demand only means a resource's
 * consuming settled flow: CASH_OUT for shared cash and CASH_IN for provider e-money.
 */
export function forecastLiquidity(input: ForecastInput): LiquidityForecast {
  const usableHistory = input.history.filter(
    (transaction) =>
      transaction.lifecycle === 'SETTLED' &&
      transaction.occurredAt <= input.generatedAt &&
      transaction.occurredAt >=
        new Date(input.generatedAt.getTime() - HISTORY_WINDOW_MINUTES * 60_000),
  );
  const historySpanMinutes = observedSpanMinutes(
    usableHistory,
    input.generatedAt,
  );
  const modelConfidence = calculateConfidence(
    usableHistory.length,
    historySpanMinutes,
  );
  const resources = input.resources.map((resource) =>
    forecastResource(resource, usableHistory, input.dataQuality),
  );
  const limitingResource = resources
    .flatMap((forecast) =>
      forecast.points.map((point) => ({
        point,
        providerId: forecast.providerId,
        resource: forecast.resource,
      })),
    )
    .sort((left, right) => {
      const risk =
        riskScore(right.point.riskBand) - riskScore(left.point.riskBand);
      return (
        risk ||
        Number(left.point.projectedMidMinor - right.point.projectedMidMinor)
      );
    })[0];

  return {
    dataQuality: input.dataQuality,
    limitingResource: limitingResource
      ? {
          providerId: limitingResource.providerId,
          resource: limitingResource.resource,
        }
      : null,
    modelConfidence,
    resources,
  };
}

function forecastResource(
  resource: ForecastResourceInput,
  history: ForecastTransaction[],
  dataQuality: DataQuality,
): ResourceForecast {
  const demand = history.filter((transaction) =>
    resource.resource === 'shared_cash'
      ? transaction.type === 'CASH_OUT'
      : transaction.type === 'CASH_IN' &&
        transaction.providerId === resource.providerId,
  );
  const demandRateMinorPerMinute = demandRate(demand);
  const spread = demandSpread(demand, demandRateMinorPerMinute);

  return {
    currentMinor: resource.currentMinor,
    demandRateMinorPerMinute,
    providerId: resource.providerId,
    resource: resource.resource,
    points: FORECAST_HORIZONS_MINUTES.map((horizonMinutes) => {
      const lowRate = Math.max(0, demandRateMinorPerMinute - spread);
      const highRate = demandRateMinorPerMinute + spread;
      const projectedHighMinor = subtractBounded(
        resource.currentMinor,
        Math.floor(lowRate * horizonMinutes),
      );
      const projectedLowMinor = subtractBounded(
        resource.currentMinor,
        Math.ceil(highRate * horizonMinutes),
      );
      const projectedMidMinor = subtractBounded(
        resource.currentMinor,
        Math.round(demandRateMinorPerMinute * horizonMinutes),
      );
      const exactEtaAllowed = dataQuality !== 'unreliable';
      const reserveMinor =
        resource.currentMinor < MIN_RESERVE_MINOR
          ? resource.currentMinor
          : MIN_RESERVE_MINOR;
      const likelyDepletionEtaMinutes = exactEtaAllowed
        ? etaMinutes(resource.currentMinor, demandRateMinorPerMinute)
        : null;
      const reserveEtaMinutes = exactEtaAllowed
        ? etaMinutes(
            resource.currentMinor - reserveMinor,
            demandRateMinorPerMinute,
          )
        : null;

      return {
        horizonMinutes,
        projectedHighMinor,
        projectedLowMinor,
        projectedMidMinor,
        riskBand: riskBand(projectedLowMinor, resource.currentMinor),
        reserveEtaMinutes,
        likelyDepletionEtaMinutes,
      };
    }),
  };
}

function demandRate(transactions: ForecastTransaction[]): number {
  if (!transactions.length) return 0;
  const total = transactions.reduce(
    (sum, transaction) => sum + Number(transaction.amountMinor),
    0,
  );
  const first = transactions.reduce(
    (earliest, transaction) =>
      transaction.occurredAt < earliest ? transaction.occurredAt : earliest,
    transactions[0].occurredAt,
  );
  const last = transactions.reduce(
    (latest, transaction) =>
      transaction.occurredAt > latest ? transaction.occurredAt : latest,
    transactions[0].occurredAt,
  );
  const observedMinutes = Math.max(
    30,
    (last.getTime() - first.getTime()) / 60_000,
  );
  return total / observedMinutes;
}

function demandSpread(
  transactions: ForecastTransaction[],
  mean: number,
): number {
  if (transactions.length < 2 || mean === 0) return mean * 0.25;
  const averageAmount =
    transactions.reduce(
      (sum, transaction) => sum + Number(transaction.amountMinor),
      0,
    ) / transactions.length;
  const variance =
    transactions.reduce(
      (sum, transaction) =>
        sum + (Number(transaction.amountMinor) - averageAmount) ** 2,
      0,
    ) / transactions.length;
  return Math.min(mean, Math.sqrt(variance) / 30);
}

function observedSpanMinutes(
  transactions: ForecastTransaction[],
  generatedAt: Date,
): number {
  if (!transactions.length) return 0;
  const earliest = transactions.reduce(
    (current, transaction) =>
      transaction.occurredAt < current ? transaction.occurredAt : current,
    transactions[0].occurredAt,
  );
  return Math.min(
    HISTORY_WINDOW_MINUTES,
    (generatedAt.getTime() - earliest.getTime()) / 60_000,
  );
}

function calculateConfidence(sampleCount: number, spanMinutes: number): number {
  // The confidence represents data coverage only; data quality remains independent.
  return Number(
    (
      Math.min(1, sampleCount / 8) *
      Math.min(1, spanMinutes / HISTORY_WINDOW_MINUTES)
    ).toFixed(4),
  );
}

function subtractBounded(current: bigint, demand: number): bigint {
  const amount = BigInt(Math.max(0, demand));
  return amount >= current ? 0n : current - amount;
}

function etaMinutes(
  available: bigint,
  demandRateMinorPerMinute: number,
): number | null {
  if (demandRateMinorPerMinute <= 0) return null;
  return Math.max(0, Math.ceil(Number(available) / demandRateMinorPerMinute));
}

function riskBand(projectedLowMinor: bigint, currentMinor: bigint): RiskBand {
  if (projectedLowMinor === 0n) return 'critical';
  const ratio = Number(projectedLowMinor) / Math.max(1, Number(currentMinor));
  if (ratio <= 0.2) return 'high';
  if (ratio <= 0.5) return 'moderate';
  return 'low';
}

function riskScore(risk: RiskBand): number {
  return { low: 0, moderate: 1, high: 2, critical: 3 }[risk];
}
