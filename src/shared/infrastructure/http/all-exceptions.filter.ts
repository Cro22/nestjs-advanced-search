import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Single place that turns any thrown error into a consistent JSON envelope.
 * Known HttpExceptions keep their status and message; anything else becomes a
 * 500 with the details logged but not leaked to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorBody = {
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message: this.resolveMessage(exception, status),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private resolveMessage(exception: unknown, status: number): string | string[] {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        return payload;
      }
      if (typeof payload === 'object' && payload !== null && 'message' in payload) {
        return (payload as { message: string | string[] }).message;
      }
    }
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'Internal server error';
    }
    return exception instanceof Error ? exception.message : 'Unexpected error';
  }
}
