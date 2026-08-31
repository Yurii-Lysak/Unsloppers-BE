import { Injectable, OnModuleInit } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { isBcryptInputWithinLimit } from '../../common/security/bcrypt-input';

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash?: string;

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomBytes(32).toString('base64url'));
  }

  hash(password: string): Promise<string> {
    if (!isBcryptInputWithinLimit(password)) {
      throw new RangeError('Password exceeds bcrypt input capacity');
    }
    return hash(password, 12);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    if (!isBcryptInputWithinLimit(password)) {
      return Promise.resolve(false);
    }
    return compare(password, passwordHash);
  }

  verifyUnknownUser(password: string): Promise<boolean> {
    if (!this.dummyHash) {
      throw new Error('PasswordService is not initialized');
    }
    return compare(password, this.dummyHash);
  }
}
