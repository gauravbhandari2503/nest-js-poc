import {
  type ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { mock } from 'vitest-mock-extended';
import { DomainError } from '../../errors/domain-error.js';
import { ErrorCode } from '../../errors/error-codes.js';
import { ProblemDetailsFilter } from '../problem-details.filter.js';
import { validationExceptionFactory } from '../../pipes/validation-exception.factory.js';

function run(exception: unknown) {
  const cls = mock<ClsService>();
  cls.getId.mockReturnValue('corr-1');
  const body: { status?: number; body?: Record<string, unknown> } = {};
  const response = {
    status: (s: number) => ((body.status = s), response),
    json: (b: Record<string, unknown>) => ((body.body = b), response),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', url: '/v1/client/bookings' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter(cls).catch(exception, host);
  return body;
}

describe('ProblemDetailsFilter', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  it('renders a DomainError with its code, status and extra fields', () => {
    const out = run(
      new DomainError(ErrorCode.SeatUnavailable, 'Seats A5 taken', {
        seatIds: ['x'],
      }),
    );
    expect(out.status).toBe(409);
    expect(out.body).toEqual({
      isSuccess: false,
      statusCode: 409,
      message: 'Seat unavailable',
      description: 'Seats A5 taken',
      data: null,
      errors: { seatIds: ['x'] },
      code: 'SEAT_UNAVAILABLE',
      correlationId: 'corr-1',
    });
  });

  it('maps framework exceptions to catalogue codes', () => {
    expect(run(new NotFoundException()).body).toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
      errors: null,
    });
  });

  it('renders validation failures as 422 with field errors', () => {
    const errors = [
      {
        property: 'seatIds',
        constraints: { arrayMaxSize: 'must contain at most 10 elements' },
        children: [],
      },
      {
        property: 'food',
        children: [
          { property: 'quantity', constraints: { min: 'must be positive' } },
        ],
      },
    ] as unknown as ValidationError[];
    const out = run(validationExceptionFactory(errors));
    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [
        { field: 'seatIds', message: 'must contain at most 10 elements' },
        { field: 'food.quantity', message: 'must be positive' },
      ],
    });
  });

  it('hides the details of unexpected errors behind a 500', () => {
    const out = run(
      new Error('select * from users: connection string postgres://secret'),
    );
    expect(out.status).toBe(500);
    expect(out.body).toMatchObject({
      code: 'INTERNAL',
      correlationId: 'corr-1',
    });
    expect(JSON.stringify(out.body)).not.toContain('secret');
  });

  it('keeps 4xx framework errors out of the 500 path', () => {
    expect(run(new BadRequestException('bad')).status).toBe(400);
  });
});
