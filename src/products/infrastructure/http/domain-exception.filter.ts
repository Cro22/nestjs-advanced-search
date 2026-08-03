import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InvalidProductError, ProductNotFoundError } from '@/products/domain/product.errors';
import {
  InvalidSearchQueryError,
  SearchUnavailableError,
} from '@/products/domain/search/search.errors';
import { AllExceptionsFilter } from '@/shared/infrastructure/http/all-exceptions.filter';

type DomainError =
  InvalidProductError | ProductNotFoundError | InvalidSearchQueryError | SearchUnavailableError;

/**
 * Translates domain errors into their HTTP counterparts in one place, so the
 * controllers can let them propagate instead of repeating try/catch. A malformed
 * request is the caller's mistake (400), a missing product is a 404, and a search
 * backend outage becomes a clean 503 rather than leaking the raw Elasticsearch
 * error. Rendering is delegated to AllExceptionsFilter so the JSON envelope stays
 * identical to every other error.
 */
@Catch(InvalidProductError, ProductNotFoundError, InvalidSearchQueryError, SearchUnavailableError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly renderer = new AllExceptionsFilter();

  catch(exception: DomainError, host: ArgumentsHost): void {
    this.renderer.catch(this.toHttpException(exception), host);
  }

  private toHttpException(exception: DomainError): HttpException {
    if (exception instanceof ProductNotFoundError) {
      return new NotFoundException(exception.message);
    }
    if (exception instanceof SearchUnavailableError) {
      return new ServiceUnavailableException(exception.message);
    }
    // InvalidProductError | InvalidSearchQueryError — a caller mistake.
    return new BadRequestException(exception.message);
  }
}
