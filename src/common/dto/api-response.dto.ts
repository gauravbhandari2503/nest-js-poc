/**
 * The one shape every response has, success or error. Success: `data` holds the endpoint's
 * DTO and `errors` is null. Error: `data` is null, `code` is the catalogue code and `errors`
 * carries the field errors (or the extra fields of the error).
 */
export class ApiResponseDto<T = unknown> {
  isSuccess: boolean;
  statusCode: number;
  message: string;
  description: string | null;
  data: T | null;
  errors: unknown;
  /** Stable catalogue code, null on success. Clients switch on this, not on `message`. */
  code: string | null;
  correlationId: string | null;
}

const SUCCESS_MESSAGE: Partial<Record<number, string>> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
};

export function successResponse<T>(
  data: T,
  statusCode: number,
  correlationId: string | null,
): ApiResponseDto<T> {
  return {
    isSuccess: true,
    statusCode,
    message: SUCCESS_MESSAGE[statusCode] ?? 'OK',
    description: null,
    data,
    errors: null,
    code: null,
    correlationId,
  };
}

export function errorResponse(input: {
  statusCode: number;
  code: string;
  message: string;
  description: string;
  errors: unknown;
  correlationId: string | null;
}): ApiResponseDto<null> {
  return { isSuccess: false, data: null, ...input };
}
