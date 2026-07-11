import { applyBalanceEvent } from './balance-semantics';

describe('applyBalanceEvent', () => {
  const position = { providerEfloatMinor: 1000n, sharedCashMinor: 2000n };

  it('moves cash-in from provider e-money into shared cash', () => {
    expect(
      applyBalanceEvent(position, {
        amountMinor: 300n,
        lifecycle: 'SETTLED',
        type: 'CASH_IN',
      }),
    ).toEqual({ providerEfloatMinor: 700n, sharedCashMinor: 2300n });
  });

  it('moves cash-out from shared cash into provider e-money', () => {
    expect(
      applyBalanceEvent(position, {
        amountMinor: 300n,
        lifecycle: 'SETTLED',
        type: 'CASH_OUT',
      }),
    ).toEqual({ providerEfloatMinor: 1300n, sharedCashMinor: 1700n });
  });

  it.each(['PENDING', 'FAILED', 'REVERSED'] as const)(
    'does not apply %s event',
    (lifecycle) => {
      expect(
        applyBalanceEvent(position, {
          amountMinor: 300n,
          lifecycle,
          type: 'CASH_IN',
        }),
      ).toEqual(position);
    },
  );

  it('rejects a settled event that would make a resource negative', () => {
    expect(() =>
      applyBalanceEvent(position, {
        amountMinor: 3000n,
        lifecycle: 'SETTLED',
        type: 'CASH_OUT',
      }),
    ).toThrow('negative balance');
  });
});
