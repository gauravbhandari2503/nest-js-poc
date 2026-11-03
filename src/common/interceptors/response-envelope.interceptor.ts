import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { map, Observable } from 'rxjs';
import { successResponse } from '../dto/api-response.dto.js';
import { successStatus } from '../utils/success-status.js';

/**
 * Wraps every successful response in `ApiResponseDto`. 204 stays empty. Registered before
 * `IdempotencyInterceptor` so that one stores and replays the bare `data`, and a replay
 * still gets the current correlation id.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const status = successStatus(
      context,
      context.switchToHttp().getRequest<Request>(),
    );
    if (status === 204) return next.handle();
    return next
      .handle()
      .pipe(
        map((body: unknown) =>
          successResponse(body ?? null, status, this.cls.getId() ?? null),
        ),
      );
  }
}
