import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { NodemailerMailService } from './nodemailer-mail.service.js';

@Global()
@Module({
  providers: [{ provide: MailService, useClass: NodemailerMailService }],
  exports: [MailService],
})
export class MailModule {}
