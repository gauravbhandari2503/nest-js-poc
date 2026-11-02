import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { AppModule, ObserveInstrument } from './app.module.js';
import { COMPANY_SECURITY } from './common/swagger/surfaces.js';
import { validationExceptionFactory } from './common/errors/validation.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const certDir = join(process.cwd(), 'certs');
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    bufferLogs: true,
    httpsOptions: {
      key: readFileSync(join(certDir, 'bookmyticket.test-key.pem')),
      cert: readFileSync(join(certDir, 'bookmyticket.test.pem')),
    },
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.use(
    helmet({
      // Swagger UI needs inline scripts/styles.
      contentSecurityPolicy: false,
    }),
  );
  app.enableCors({
    origin: config.get('FRONTEND_ORIGIN', { infer: true }),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Movie Booking API')
    .setVersion('1.0')
    .addBearerAuth()
    // Super admins acting on a company send this on every /admin call (ADR-010).
    .addApiKey(
      { type: 'apiKey', name: 'X-Company-Id', in: 'header' },
      COMPANY_SECURITY,
    )
    .addTag('public', 'No login: browse cities, movies, shows')
    .addTag('auth', 'Login, refresh, password setup and reset')
    .addTag('client', 'Customer app: bookings, memberships, refunds')
    .addTag(
      'admin',
      'Company portal: venues, shows, staff. Super admin may act on a company with X-Company-Id',
    )
    .addTag('platform', 'Super admin: companies, catalog, tax, settlements')
    .addTag('webhooks', 'Payment gateway callbacks')
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    { jsonDocumentUrl: 'docs-json' },
  );

  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
