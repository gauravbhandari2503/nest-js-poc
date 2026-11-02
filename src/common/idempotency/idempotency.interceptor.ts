import { createHash } from 'node:crypto';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, mergeMap, Observable, of } from 'rxjs';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { DomainError } from '../errors/domain-error.js';
import { ErrorCode } from '../errors/error-codes.js';

export const IDEMPOTENT_KEY = 'idempotent';
export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Marks a route that needs an `Idempotency-Key` header (create booking, buy membership, record settlement). */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

type Req = Request & { user?: AuthenticatedUser };

/**
 * Makes a POST safe to retry. The client sends `Idempotency-Key: <uuid>`:
 *
 * - first call: the key is claimed, the handler runs, and its response is stored;
 * - same key and same request again: the stored response is replayed and the handler does not run;
 * - same key, different request: 422 IDEMPOTENCY_KEY_REUSED;
 * - same key while the first call is still running: 409 IDEMPOTENCY_KEY_IN_PROGRESS;
 * - the first call failed: the claim is released, so a retry runs the handler again.
 *
 * The claim is the primary key `(key, user_id)` of `idempotency_keys`, so two concurrent
 * requests with one key cannot both run. Keys are per user and expire after 24 hours
 * (a daily job purges them).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(
      IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return next.handle();
    return from(this.run(context, next)).pipe(mergeMap((result) => result));
  }

  private async run(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Req>();
    const response = http.getResponse<Response>();

    const key = request.headers[IDEMPOTENCY_HEADER];
    if (typeof key !== 'string' || key.length < 8 || key.length > 128) {
      throw new DomainError(
        ErrorCode.ValidationFailed,
        'Idempotency-Key header is required',
        {
          errors: [
            {
              field: 'Idempotency-Key',
              message: 'must be 8 to 128 characters (a uuid is ideal)',
            },
          ],
        },
      );
    }
    const userId = request.user?.id;
    if (!userId)
      throw new DomainError(
        ErrorCode.Unauthenticated,
        'Authentication required',
      );

    const requestHash = hashRequest(request);
    const where = { key_userId: { key, userId } };
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);

    // Expired rows count as absent.
    await this.prisma.idempotencyKey.deleteMany({
      where: { key, userId, expiresAt: { lt: new Date() } },
    });

    const claimed = await this.prisma.idempotencyKey.createMany({
      data: [{ key, userId, requestHash, expiresAt }],
      skipDuplicates: true,
    });

    if (claimed.count === 0) {
      const existing = await this.prisma.idempotencyKey.findUnique({ where });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new DomainError(
            ErrorCode.IdempotencyKeyReused,
            'This Idempotency-Key was already used with a different request',
          );
        }
        if (existing.responseStatus === null) {
          throw new DomainError(
            ErrorCode.IdempotencyKeyInProgress,
            'A request with this Idempotency-Key is still being processed',
          );
        }
        response.status(existing.responseStatus);
        response.setHeader('Idempotent-Replayed', 'true');
        return of(existing.responseBody);
      }
      // The row vanished between the two queries (expired and purged): treat as a fresh call.
    }

    try {
      const body: unknown = await new Promise((resolve, reject) =>
        next.handle().subscribe({
          next: resolve,
          error: reject,
          complete: () => resolve(undefined),
        }),
      );
      await this.prisma.idempotencyKey.update({
        where,
        data: {
          responseStatus: successStatus(context, request),
          responseBody: (body ?? null) as Prisma.InputJsonValue,
        },
      });
      return of(body);
    } catch (error) {
      await this.prisma.idempotencyKey.deleteMany({ where: { key, userId } });
      throw error;
    }
  }
}

/** Same method, path and body means same request. */
export function hashRequest(
  request: Pick<Request, 'method' | 'originalUrl' | 'body'>,
): string {
  return createHash('sha256')
    .update(
      `${request.method} ${request.originalUrl}\n${JSON.stringify(request.body ?? null)}`,
    )
    .digest('hex');
}

/**
 * The status Nest will send for a successful call. It is applied after interceptors run,
 * so `response.statusCode` is not final yet: read it from `@HttpCode` or the method default.
 */
function successStatus(context: ExecutionContext, request: Request): number {
  const declared = Reflect.getMetadata(
    HTTP_CODE_METADATA,
    context.getHandler(),
  ) as number | undefined;
  return declared ?? (request.method === 'POST' ? 201 : 200);
}
