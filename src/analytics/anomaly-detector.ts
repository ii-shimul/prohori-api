import { DataQuality } from './liquidity-forecast';

export const ANOMALY_DETECTOR_VERSION = '1.0.0';
export const ANOMALY_WINDOW_MINUTES = 60;
const VELOCITY_WINDOW_MINUTES = 30;
const NEAR_IDENTICAL_TOLERANCE = 0.02;

export type AnomalyType = 'repeated_amount' | 'abnormal_velocity';

export interface AnomalyTransaction {
  amountMinor: bigint;
  id: string;
  lifecycle: string;
  occurredAt: Date;
  providerId: string;
}

export interface AnomalySignalCandidate {
  baselineValue: number;
  dataQuality: DataQuality;
  detectorType: AnomalyType;
  evidenceWindowEnd: Date;
  evidenceWindowStart: Date;
  modelConfidence: number;
  observedValue: number;
  possibleBenignExplanation: string;
  score: number;
  sourceTransactionIds: string[];
  threshold: number;
}

/**
 * Pure, deterministic review-signal detectors. These signals describe unusual
 * activity relative to the stored outlet/provider baseline; they are not fraud verdicts.
 */
export function detectUnusualActivity(input: {
  dataQuality: DataQuality;
  generatedAt: Date;
  history: AnomalyTransaction[];
  modelConfidence: number;
  providerId: string;
}): AnomalySignalCandidate[] {
  const windowStart = new Date(
    input.generatedAt.getTime() - ANOMALY_WINDOW_MINUTES * 60_000,
  );
  const transactions = input.history.filter(
    (transaction) =>
      transaction.lifecycle === 'SETTLED' &&
      transaction.providerId === input.providerId &&
      transaction.occurredAt <= input.generatedAt,
  );
  const current = transactions.filter(
    (transaction) => transaction.occurredAt >= windowStart,
  );
  const baseline = transactions.filter(
    (transaction) => transaction.occurredAt < windowStart,
  );
  const common = {
    dataQuality: input.dataQuality,
    evidenceWindowEnd: input.generatedAt,
    evidenceWindowStart: windowStart,
    modelConfidence: input.modelConfidence,
  };

  const signals: AnomalySignalCandidate[] = [];
  for (const cluster of amountClusters(current)) {
    const baselineCount = baseline.filter((transaction) =>
      isNearAmount(transaction.amountMinor, cluster.amountMinor),
    ).length;
    const threshold = Math.max(3, baselineCount + 2);
    if (cluster.transactions.length >= threshold) {
      signals.push({
        ...common,
        baselineValue: baselineCount,
        detectorType: 'repeated_amount',
        observedValue: cluster.transactions.length,
        possibleBenignExplanation:
          'A scheduled campaign or common denomination may produce repeated amounts; review the event context.',
        score: boundedScore(cluster.transactions.length / threshold),
        sourceTransactionIds: cluster.transactions
          .sort(
            (left, right) =>
              left.occurredAt.getTime() - right.occurredAt.getTime(),
          )
          .map((transaction) => transaction.id),
        threshold,
      });
    }
  }

  const velocityStart = new Date(
    input.generatedAt.getTime() - VELOCITY_WINDOW_MINUTES * 60_000,
  );
  const observedVelocity = current.filter(
    (transaction) => transaction.occurredAt >= velocityStart,
  );
  const baselineVelocity = baselineBucketAverage(baseline, windowStart);
  const velocityThreshold = Math.max(4, Math.ceil(baselineVelocity * 3));
  if (observedVelocity.length >= velocityThreshold) {
    signals.push({
      ...common,
      baselineValue: baselineVelocity,
      detectorType: 'abnormal_velocity',
      observedValue: observedVelocity.length,
      possibleBenignExplanation:
        'A shift change, local event, or delayed feed delivery may create a short-lived transaction burst; review timing and feed quality.',
      score: boundedScore(observedVelocity.length / velocityThreshold),
      sourceTransactionIds: observedVelocity.map(
        (transaction) => transaction.id,
      ),
      threshold: velocityThreshold,
    });
  }
  return signals;
}

function amountClusters(transactions: AnomalyTransaction[]) {
  const clusters: Array<{
    amountMinor: bigint;
    transactions: AnomalyTransaction[];
  }> = [];
  for (const transaction of [...transactions].sort((a, b) =>
    Number(a.amountMinor - b.amountMinor),
  )) {
    const cluster = clusters.find((candidate) =>
      isNearAmount(transaction.amountMinor, candidate.amountMinor),
    );
    if (cluster) cluster.transactions.push(transaction);
    else
      clusters.push({
        amountMinor: transaction.amountMinor,
        transactions: [transaction],
      });
  }
  return clusters;
}

function baselineBucketAverage(
  transactions: AnomalyTransaction[],
  windowStart: Date,
): number {
  const bucketCount = 6;
  const counts = Array.from({ length: bucketCount }, () => 0);
  for (const transaction of transactions) {
    const minutesBeforeWindow =
      (windowStart.getTime() - transaction.occurredAt.getTime()) / 60_000;
    const bucket = Math.floor(minutesBeforeWindow / VELOCITY_WINDOW_MINUTES);
    if (bucket >= 0 && bucket < bucketCount) counts[bucket] += 1;
  }
  return counts.reduce((sum, count) => sum + count, 0) / bucketCount;
}

function isNearAmount(left: bigint, right: bigint): boolean {
  const larger = left > right ? left : right;
  return (
    larger === 0n ||
    Number(left > right ? left - right : right - left) / Number(larger) <=
      NEAR_IDENTICAL_TOLERANCE
  );
}

function boundedScore(value: number): number {
  return Number(Math.min(1, value).toFixed(4));
}
