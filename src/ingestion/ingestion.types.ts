import {
  TransactionLifecycle,
  TransactionType,
} from '../liquidity/balance-semantics';

export type ProviderCode = 'PROVIDER_A' | 'PROVIDER_B' | 'PROVIDER_C';

export interface IngestionEvent {
  amountMinor: bigint;
  eventId: string;
  eventVersion: number;
  idempotencyKey: string;
  lifecycle: TransactionLifecycle;
  occurredAt: Date;
  outletCode: string;
  receivedAt: Date;
  type: TransactionType;
}

export interface IngestionSnapshot {
  amountMinor: bigint;
  observedAt: Date;
  outletCode: string;
  resource: 'provider_efloat' | 'shared_cash';
}

export interface IngestionBatch {
  checksum: string;
  events: IngestionEvent[];
  receivedAt: Date;
  sequence: bigint;
  snapshots: IngestionSnapshot[];
  sourceAt: Date;
}

export interface IngestionReceipt {
  acceptedEvents: number;
  batchId: string;
  duplicateEvents: number;
  provider: ProviderCode;
  qualityStatus: 'degraded' | 'healthy';
  rejectedEvents: number;
  sequence: string;
}
