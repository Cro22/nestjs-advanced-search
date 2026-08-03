import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from '@/products/infrastructure/http/domain-exception.filter';
import { InvalidProductNameError, ProductNotFoundError } from '@/products/domain/product.errors';
import {
  InvalidSearchQueryError,
  SearchUnavailableError,
} from '@/products/domain/search/search.errors';

function makeHost(url = '/api/products') {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url, method: 'POST' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it('maps a product invariant error to 400', () => {
    const { host, status, json } = makeHost();
    filter.catch(new InvalidProductNameError(), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Product name is required' }),
    );
  });

  it('maps an invalid search query to 400', () => {
    const { host, status } = makeHost();
    filter.catch(new InvalidSearchQueryError('bad'), host);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('maps a missing product to 404', () => {
    const { host, status, json } = makeHost();
    filter.catch(new ProductNotFoundError('abc'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Product abc does not exist' }),
    );
  });

  it('maps a search backend outage to 503', () => {
    const { host, status } = makeHost();
    filter.catch(new SearchUnavailableError(), host);
    expect(status).toHaveBeenCalledWith(503);
  });
});
