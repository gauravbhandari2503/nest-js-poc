import { Global, Module } from '@nestjs/common';
import { TenantContext } from './tenant-context.js';
import { TenantContextGuard } from './tenant-context.guard.js';

@Global()
@Module({
  providers: [TenantContext, TenantContextGuard],
  exports: [TenantContext, TenantContextGuard],
})
export class TenancyModule {}
