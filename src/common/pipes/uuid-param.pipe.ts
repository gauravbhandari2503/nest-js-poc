import { ParseUUIDPipe } from '@nestjs/common';
import { DomainError } from '../errors/domain-error.js';
import { ErrorCode } from '../errors/error-codes.js';

/** `@Param('id', uuidParam)`: a malformed id answers 422 like any other validation error. */
export const uuidParam = new ParseUUIDPipe({
  exceptionFactory: () =>
    new DomainError(ErrorCode.ValidationFailed, 'Request validation failed', {
      errors: [{ field: 'id', message: 'must be a UUID' }],
    }),
});
