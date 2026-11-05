import { Module } from '@nestjs/common';
import { IdentityTokensModule } from './identity-tokens.module.js';
import { SetPasswordMailHandler } from './jobs/set-password-mail.handler.js';

/** Imported by `WorkerModule`: the outbox handlers of `identity`. */
@Module({
  imports: [IdentityTokensModule],
  providers: [SetPasswordMailHandler],
})
export class IdentityJobsModule {}
