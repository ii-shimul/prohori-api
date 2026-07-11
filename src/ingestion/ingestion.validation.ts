import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { IngestionBatch } from './ingestion.types';

const timestamp = z
  .string()
  .datetime({ offset: true })
  .transform((value, context) => {
    const result = new Date(value);
    if (Number.isNaN(result.getTime())) {
      context.addIssue({ code: 'custom', message: 'Invalid timestamp.' });
      return z.NEVER;
    }
    return result;
  });

const eventSchema = z.object({
  amountMinor: z.number().int().positive().safe(),
  eventId: z.string().min(1).max(128),
  eventVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1).max(128),
  lifecycle: z.enum(['PENDING', 'SETTLED', 'FAILED', 'REVERSED']),
  occurredAt: timestamp,
  outletCode: z.string().min(1).max(50),
  receivedAt: timestamp,
  type: z.enum(['CASH_IN', 'CASH_OUT']),
});

const snapshotSchema = z.object({
  amountMinor: z.number().int().nonnegative().safe(),
  observedAt: timestamp,
  outletCode: z.string().min(1).max(50),
  resource: z.enum(['provider_efloat', 'shared_cash']),
});

const batchSchema = z.object({
  checksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Checksum must be SHA-256 hex.'),
  events: z.array(eventSchema).max(500),
  receivedAt: timestamp,
  sequence: z.number().int().positive().safe(),
  snapshots: z.array(snapshotSchema).max(100),
  sourceAt: timestamp,
});

export function parseIngestionBatch(input: unknown): IngestionBatch {
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'INVALID_INGESTION_BATCH',
      fieldErrors: parsed.error.flatten().fieldErrors,
      message: 'The ingestion batch does not match the required schema.',
    });
  }

  return {
    ...parsed.data,
    events: parsed.data.events.map((event) => ({
      ...event,
      amountMinor: BigInt(event.amountMinor),
    })),
    sequence: BigInt(parsed.data.sequence),
    snapshots: parsed.data.snapshots.map((snapshot) => ({
      ...snapshot,
      amountMinor: BigInt(snapshot.amountMinor),
    })),
  };
}

export function calculateBatchChecksum(input: unknown): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

export function payloadForChecksum(batch: IngestionBatch): object {
  return {
    events: batch.events.map((event) => ({
      ...event,
      amountMinor: Number(event.amountMinor),
      occurredAt: event.occurredAt.toISOString(),
      receivedAt: event.receivedAt.toISOString(),
    })),
    receivedAt: batch.receivedAt.toISOString(),
    sequence: Number(batch.sequence),
    snapshots: batch.snapshots.map((snapshot) => ({
      ...snapshot,
      amountMinor: Number(snapshot.amountMinor),
      observedAt: snapshot.observedAt.toISOString(),
    })),
    sourceAt: batch.sourceAt.toISOString(),
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
