import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isBcryptInputWithinLimit } from '../../common/security/bcrypt-input';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';

interface LoginResult {
  token: string;
  userId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
  ) {}

  async login({ email, password }: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email.trim(),
          mode: 'insensitive',
        },
      },
      select: { id: true, passwordHash: true },
    });

    const inputWithinLimit = isBcryptInputWithinLimit(password);
    const valid = !inputWithinLimit
      ? await this.passwords.verifyUnknownUser('rejected-overlong-input')
      : user?.passwordHash
        ? await this.passwords.verify(password, user.passwordHash)
        : await this.passwords.verifyUnknownUser(password);

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      token: await this.jwt.signAsync({ sub: user.id }),
      userId: user.id,
    };
  }
}
