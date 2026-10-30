import type { ValidationError } from '@nestjs/common';
import { DomainError } from './domain-error.js';
import { ErrorCode } from './error-codes.js';

export interface FieldError {
  field: string;
  message: string;
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** Passed to the global ValidationPipe so DTO failures become 422 VALIDATION_FAILED. */
export function validationExceptionFactory(errors: ValidationError[]) {
  return new DomainError(
    ErrorCode.ValidationFailed,
    'Request validation failed',
    {
      errors: flatten(errors),
    },
  );
}
