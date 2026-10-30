import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const certDir = join(process.cwd(), 'certs');
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    httpsOptions: {
      key: readFileSync(join(certDir, 'bookmyticket.test-key.pem')),
      cert: readFileSync(join(certDir, 'bookmyticket.test.pem')),
    },
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
