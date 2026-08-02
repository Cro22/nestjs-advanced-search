/** Raised when an operation targets a product id that does not exist. */
export class ProductNotFoundError extends Error {
  constructor(id: string) {
    super(`Product ${id} does not exist`);
    this.name = 'ProductNotFoundError';
  }
}

/**
 * Base class for invariant violations raised while building a Product. The HTTP
 * layer maps every subclass to a 400: they all describe a caller mistake, never
 * a server fault.
 */
export class InvalidProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Raised when a product is created or updated without a usable name. */
export class InvalidProductNameError extends InvalidProductError {
  constructor() {
    super('Product name is required');
  }
}

/** Raised when a product price is negative. */
export class NegativeProductPriceError extends InvalidProductError {
  constructor() {
    super('Product price cannot be negative');
  }
}

/** Raised when the supplied coordinates fall outside valid latitude/longitude. */
export class InvalidProductCoordinatesError extends InvalidProductError {
  constructor() {
    super('Product coordinates are out of range');
  }
}
