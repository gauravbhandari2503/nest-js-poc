import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller.js';
import { AuthPasswordController } from './controllers/auth-password.controller.js';
import { AuthService } from './services/auth.service.js';
import { PasswordHasher } from './services/password-hasher.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';

@Module({
  controllers: [AuthController, AuthPasswordController],
  providers: [AuthService, PasswordService, PasswordHasher, TokenService],
  exports: [PasswordService, PasswordHasher],
})
export class IdentityModule {}
