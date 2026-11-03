import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { errorResponse } from '../dto/api-response.dto.js';
import { DomainError } from '../errors/domain-error.js';
import { ErrorCode, type ErrorCodeValue } from '../errors/error-codes.js';

const STATUS_TO_CODE: Partial<Record<number, ErrorCodeValue>> = {
  [HttpStatus.UNAUTHORIZED]: ErrorCode.Unauthenticated,
  [HttpStatus.FORBIDDEN]: ErrorCode.Forbidden,
  [HttpStatus.NOT_FOUND]: ErrorCode.NotFound,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RateLimited,
};

const titleOf = (code: string) =>
  code.charAt(0) + code.slice(1).toLowerCase().replaceAll('_', ' ');

/** Field errors when there are some, else the error's extra fields (e.g. `seatIds`). */
const errorsOf = (extensions: Record<string, unknown>): unknown =>
  extensions['errors'] ??
  (Object.keys(extensions).length > 0 ? extensions : null);

/**
 * Turns every error into the shared `ApiResponseDto` envelope. Unknown errors become a
 * generic 500: stack traces, SQL and Prisma messages never reach the client; the log
 * line carries the correlation id instead.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  constructor(private readonly cls: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const correlationId = this.cls.getId();

    const { status, code, detail, extensions } = this.normalise(exception);

    if (status >= 500) {
      this.logger.error(
        { err: exception, correlationId },
        `Unhandled error on ${request.method} ${request.url}`,
      );
    }

    response.status(status).json(
      errorResponse({
        statusCode: status,
        code,
        message: titleOf(code),
        description: detail,
        errors: errorsOf(extensions),
        correlationId: correlationId ?? null,
      }),
    );
  }

  private normalise(exception: unknown): {
    status: number;
    code: ErrorCodeValue;
    detail: string;
    extensions: Record<string, unknown>;
  } {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        code: exception.code,
        detail: exception.detail,
        extensions: exception.extensions,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        STATUS_TO_CODE[status] ??
        (status >= 500 ? ErrorCode.Internal : ErrorCode.ValidationFailed);
      return {
        status,
        code,
        detail: exception.message,
        extensions: {},
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.Internal,
      detail:
        'Something went wrong. Quote the correlationId when reporting it.',
      extensions: {},
    };
  }
}
