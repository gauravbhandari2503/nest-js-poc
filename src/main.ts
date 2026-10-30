import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { AppModule, ObserveInstrument } from './app.module.js';
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
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Movie Booking API')
    .setVersion('1.0')
    .addBearerAuth()
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
