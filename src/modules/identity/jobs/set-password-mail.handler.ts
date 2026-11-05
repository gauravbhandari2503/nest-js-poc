import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.validation.js';
import { MailService } from '../../../infra/mail/mail.service.js';
import { OutboxHandlerRegistry } from '../../../infra/outbox/outbox-handler.registry.js';
import type {
  OutboxHandler,
  OutboxMessage,
} from '../../../infra/outbox/outbox.types.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { SET_PASSWORD_REQUESTED } from '../constants/identity-events.js';
import { AuthTokenService } from '../services/auth-token.service.js';
import { SET_PASSWORD_TTL_MS } from '../services/password.service.js';

/** Sends the "set your password" email to an `INVITED` user (a new company owner). */
@Injectable()
export class SetPasswordMailHandler implements OutboxHandler, OnModuleInit {
  readonly types = [SET_PASSWORD_REQUESTED];
  private readonly frontendOrigin: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly registry: OutboxHandlerRegistry,
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokenService,
    private readonly mail: MailService,
  ) {
    this.frontendOrigin = config.get('FRONTEND_ORIGIN', { infer: true });
  }

  onModuleInit() {
    this.registry.register(this);
  }

  async handle(message: OutboxMessage): Promise<void> {
    const { userId, companyName } = message.data;
    if (typeof userId !== 'string') return;

    // Delivery is at-least-once: an account that already set its password needs nothing.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'INVITED') return;

    const token = await this.tokens.issue(
      user.id,
      'SET_PASSWORD',
      SET_PASSWORD_TTL_MS,
    );
    const link = `${this.frontendOrigin}/set-password?token=${token}`;
    const where = typeof companyName === 'string' ? ` for ${companyName}` : '';
    await this.mail.send({
      to: user.email,
      subject: 'Set your password',
      text: `Hi ${user.fullName},\n\nAn account${where} was created for you. Use this link to choose your password (valid for 72 hours):\n${link}\n\nIf you were not expecting this, ignore this email.`,
    });
  }
}
