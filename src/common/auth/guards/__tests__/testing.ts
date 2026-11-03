import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../authenticated-user.js';

/** Minimal ExecutionContext for guard unit tests. */
export function fakeContext(
  target: { handler: () => void; cls: new () => unknown },
  request: {
    user?: AuthenticatedUser;
    method?: string;
    headers?: Record<string, unknown>;
    companyId?: string;
  },
) {
  const req = { headers: {}, ...request };
  const context = {
    getHandler: () => target.handler,
    getClass: () => target.cls,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}
