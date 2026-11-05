import { Module } from '@nestjs/common';
import { AuthTokenService } from './services/auth-token.service.js';

@Module({
  providers: [AuthTokenService],
  exports: [AuthTokenService],
})
export class IdentityTokensModule {}
