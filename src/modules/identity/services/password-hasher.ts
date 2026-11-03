import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

@Injectable()
export class PasswordHasher {
  // Verified when the email is unknown, so a miss takes as long as a wrong password.
  private readonly decoy = argon2.hash('decoy-password', {
    type: argon2.argon2id,
  });

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string | null | undefined, password: string) {
    if (!hash) {
      await argon2.verify(await this.decoy, password).catch(() => false);
      return false;
    }
    return argon2.verify(hash, password).catch(() => false);
  }
}
