import fc from 'fast-check';
import { Money } from '@/shared/domain/money';

describe('Money (property based)', () => {
  it('round trips any integer cent amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }), (cents) => {
        expect(Money.fromCents(cents).toCents()).toBe(cents);
      }),
    );
  });

  it('preserves any cent-aligned decimal through fromDecimal/toDecimal', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (cents) => {
        const decimal = cents / 100;
        expect(Money.fromDecimal(decimal).toCents()).toBe(cents);
        expect(Money.fromDecimal(decimal).toDecimal()).toBeCloseTo(decimal, 2);
      }),
    );
  });

  it('orders consistently with the underlying cent amounts', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        const left = Money.fromCents(a);
        const right = Money.fromCents(b);
        expect(left.greaterThan(right)).toBe(a > b);
        expect(left.lessThan(right)).toBe(a < b);
        expect(left.equals(right)).toBe(a === b);
      }),
    );
  });
});
