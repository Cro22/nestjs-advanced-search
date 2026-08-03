import { InvalidMoneyError, Money } from '@/shared/domain/money';

describe('Money', () => {
  it('round trips a decimal through cents exactly', () => {
    const money = Money.fromDecimal(899.99);
    expect(money.toCents()).toBe(89999);
    expect(money.toDecimal()).toBe(899.99);
  });

  it('avoids float artefacts that plague naive number math', () => {
    // 0.1 + 0.2 !== 0.3 as floats, but the cent totals are exact.
    const total = Money.fromCents(
      Money.fromDecimal(0.1).toCents() + Money.fromDecimal(0.2).toCents(),
    );
    expect(total.equals(Money.fromDecimal(0.3))).toBe(true);
  });

  it('rounds a fractional cent to the nearest cent', () => {
    expect(Money.fromDecimal(10.006).toCents()).toBe(1001);
    expect(Money.fromDecimal(10.004).toCents()).toBe(1000);
  });

  it('builds from exact cents', () => {
    expect(Money.fromCents(1500).toDecimal()).toBe(15);
  });

  it('compares by amount', () => {
    const cheap = Money.fromDecimal(5);
    const dear = Money.fromDecimal(50);
    expect(dear.greaterThan(cheap)).toBe(true);
    expect(cheap.lessThan(dear)).toBe(true);
    expect(Money.fromDecimal(5).equals(cheap)).toBe(true);
  });

  it('detects a negative amount', () => {
    expect(Money.fromDecimal(-1).isNegative()).toBe(true);
    expect(Money.fromDecimal(0).isNegative()).toBe(false);
  });

  it('rejects a non finite decimal', () => {
    expect(() => Money.fromDecimal(Number.NaN)).toThrow(InvalidMoneyError);
    expect(() => Money.fromDecimal(Number.POSITIVE_INFINITY)).toThrow(InvalidMoneyError);
  });

  it('rejects non integer cents', () => {
    expect(() => Money.fromCents(10.5)).toThrow(InvalidMoneyError);
  });
});
