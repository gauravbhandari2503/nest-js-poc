import type { ExecutionContext } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';

/**
 * The status Nest will send for a successful call. It is applied after interceptors run,
 * so `response.statusCode` is not final yet: read it from `@HttpCode` or the method default.
 */
export function successStatus(
  context: ExecutionContext,
  request: Pick<Request, 'method'>,
): number {
  const declared = Reflect.getMetadata(
    HTTP_CODE_METADATA,
    context.getHandler(),
  ) as number | undefined;
  return declared ?? (request.method === 'POST' ? 201 : 200);
}
