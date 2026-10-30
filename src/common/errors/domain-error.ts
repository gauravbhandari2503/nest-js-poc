import { ERROR_STATUS, type ErrorCodeValue } from './error-codes.js';

/**
 * A business-rule failure with a stable `code`. The status comes from the code, so a
 * service never picks HTTP statuses. `extensions` are extra fields on the response body
 * (for example `seatIds` on SEAT_UNAVAILABLE).
 */
export class DomainError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCodeValue,
    readonly detail: string,
    readonly extensions: Record<string, unknown> = {},
  ) {
    super(detail);
    this.name = 'DomainError';
    this.status = ERROR_STATUS[code];
  }
}
