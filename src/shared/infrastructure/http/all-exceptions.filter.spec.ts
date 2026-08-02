import { ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from '@/shared/infrastructure/http/all-exceptions.filter';

function makeHost(url = '/api/x', method = 'GET') {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url, method }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('shapes a string HttpException into the error envelope', () => {
    const { host, status, json } = makeHost('/api/products');
    filter.catch(new BadRequestException('bad input'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'bad input', path: '/api/products' }),
    );
  });

  it('preserves an array validation message', () => {
    const { host, json } = makeHost();
    filter.catch(new BadRequestException(['a required', 'b invalid']), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: ['a required', 'b invalid'] }),
    );
  });

  it('passes through a structured payload without a message field', () => {
    const { host, status, json } = makeHost();
    const payload = { status: 'error', info: {}, details: {} };
    filter.catch(new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE), host);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(payload);
  });

  it('hides internal details for a non-HTTP error', () => {
    const { host, status, json } = makeHost();
    filter.catch(new Error('db exploded'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Internal server error' }),
    );
  });
});
