/** Raised when an operation targets a product id that does not exist. */
export class ProductNotFoundError extends Error {
  constructor(id: string) {
    super(`Product ${id} does not exist`);
    this.name = 'ProductNotFoundError';
  }
}
