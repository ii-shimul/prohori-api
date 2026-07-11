export type TransactionLifecycle =
  'FAILED' | 'PENDING' | 'REVERSED' | 'SETTLED';
export type TransactionType = 'CASH_IN' | 'CASH_OUT';

export interface BalancePosition {
  providerEfloatMinor: bigint;
  sharedCashMinor: bigint;
}

export interface BalanceEvent {
  amountMinor: bigint;
  lifecycle: TransactionLifecycle;
  type: TransactionType;
}

export function applyBalanceEvent(
  position: BalancePosition,
  event: BalanceEvent,
): BalancePosition {
  if (event.amountMinor <= 0n || event.lifecycle !== 'SETTLED') {
    return position;
  }

  const direction = event.type === 'CASH_IN' ? 1n : -1n;
  const next = {
    providerEfloatMinor:
      position.providerEfloatMinor - direction * event.amountMinor,
    sharedCashMinor: position.sharedCashMinor + direction * event.amountMinor,
  };

  if (next.providerEfloatMinor < 0n || next.sharedCashMinor < 0n) {
    throw new RangeError('Settled event would create a negative balance.');
  }

  return next;
}
