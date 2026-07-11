import { detectUnusualActivity } from './anomaly-detector';

const now = new Date('2026-01-01T12:00:00.000Z');
const transaction = (
  id: string,
  amountMinor: bigint,
  minutesAgo: number,
  providerId = 'provider-a',
) => ({
  amountMinor,
  id,
  lifecycle: 'SETTLED',
  occurredAt: new Date(now.getTime() - minutesAgo * 60_000),
  providerId,
});

function detect(history = [] as ReturnType<typeof transaction>[]) {
  return detectUnusualActivity({
    dataQuality: 'healthy',
    generatedAt: now,
    history,
    modelConfidence: 0.8,
    providerId: 'provider-a',
  });
}

describe('detectUnusualActivity', () => {
  it('does not trigger for normal baseline activity', () => {
    expect(
      detect([
        transaction('baseline-1', 10_000n, 120),
        transaction('current-1', 10_000n, 45),
      ]),
    ).toEqual([]);
  });

  it('detects repeated and near-identical amounts with transparent evidence', () => {
    const result = detect([
      transaction('repeat-1', 30_000n, 50),
      transaction('repeat-2', 30_300n, 40),
      transaction('repeat-3', 30_100n, 35),
    ]);
    const repeated = result.find(
      (signal) => signal.detectorType === 'repeated_amount',
    );

    expect(repeated).toMatchObject({
      baselineValue: 0,
      observedValue: 3,
      threshold: 3,
      score: 1,
    });
    expect(repeated?.sourceTransactionIds).toEqual([
      'repeat-1',
      'repeat-2',
      'repeat-3',
    ]);
    expect(repeated?.possibleBenignExplanation).toContain('scheduled campaign');
  });

  it('detects abnormal velocity against six prior baseline buckets', () => {
    const result = detect([
      transaction('baseline-1', 10_000n, 100),
      transaction('burst-1', 10_000n, 20),
      transaction('burst-2', 10_000n, 15),
      transaction('burst-3', 10_000n, 10),
      transaction('burst-4', 10_000n, 5),
    ]);

    expect(
      result.find((signal) => signal.detectorType === 'abnormal_velocity'),
    ).toMatchObject({
      observedValue: 4,
      threshold: 4,
    });
  });

  it.each(['degraded', 'unreliable'] as const)(
    'propagates %s data quality without changing the detector evidence',
    (dataQuality) => {
      const result = detectUnusualActivity({
        dataQuality,
        generatedAt: now,
        history: [
          transaction('repeat-1', 30_000n, 50),
          transaction('repeat-2', 30_000n, 40),
          transaction('repeat-3', 30_000n, 35),
        ],
        modelConfidence: 0.8,
        providerId: 'provider-a',
      });
      expect(result[0].dataQuality).toBe(dataQuality);
      expect(result[0].modelConfidence).toBe(0.8);
    },
  );
});
