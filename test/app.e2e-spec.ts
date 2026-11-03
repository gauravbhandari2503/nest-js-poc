import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './auth/helpers.js';

describe('app boot (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createApp());
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves /health without a login', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
