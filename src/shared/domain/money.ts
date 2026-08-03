/**
 * Money value object stored as an integer number of minor units (cents). Keeping
 * the amount as an integer avoids the precision errors that come with using a
 * float for money (0.1 + 0.2, 899.99 * 100, and friends). Conversions to and
 * from a decimal happen only at the edges (HTTP, Postgres, Elasticsearch), while
 * every comparison inside the domain is exact integer arithmetic.
 */
export class Money {
  private constructor(private readonly cents: number) {}

  /** Build from a decimal amount (e.g. 899.99), rounding to the nearest cent. */
  static fromDecimal(amount: number): Money {
    if (!Number.isFinite(amount)) {
      throw new InvalidMoneyError(`Amount must be a finite number, got ${amount}`);
    }
    return new Money(Math.round(amount * 100));
  }

  /** Build from an exact integer number of cents. */
  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) {
      throw new InvalidMoneyError(`Cents must be an integer, got ${cents}`);
    }
    return new Money(cents);
  }

  toCents(): number {
    return this.cents;
  }

  toDecimal(): number {
    return this.cents / 100;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  greaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  lessThan(other: Money): boolean {
    return this.cents < other.cents;
  }
}

/** Raised when a Money value cannot be constructed from the given input. */
export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyError';
  }
}
