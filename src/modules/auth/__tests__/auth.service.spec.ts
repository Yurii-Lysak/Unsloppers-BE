import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthService } from '../auth.service';
import { PasswordService } from '../password.service';

describe('AuthService', () => {
  let service: AuthService;
  const findFirst = jest.fn();
  const signAsync = jest.fn();
  const verify = jest.fn();
  const verifyUnknownUser = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: { user: { findFirst } } },
        { provide: JwtService, useValue: { signAsync } },
        {
          provide: PasswordService,
          useValue: { verify, verifyUnknownUser },
        },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('returns a signed session for valid credentials', async () => {
    findFirst.mockResolvedValue({ id: 'user-id', passwordHash: 'stored-hash' });
    verify.mockResolvedValue(true);
    signAsync.mockResolvedValue('signed-token');

    await expect(
      service.login({
        email: ' USER@example.com ',
        password: 'test-password',
      }),
    ).resolves.toEqual({ token: 'signed-token', userId: 'user-id' });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        email: { equals: 'USER@example.com', mode: 'insensitive' },
      },
      select: { id: true, passwordHash: true },
    });
    expect(signAsync).toHaveBeenCalledWith({ sub: 'user-id' });
  });

  it('accepts a password whose UTF-8 representation is exactly 72 bytes', async () => {
    const password = '€'.repeat(24);
    findFirst.mockResolvedValue({ id: 'user-id', passwordHash: 'stored-hash' });
    verify.mockResolvedValue(true);
    signAsync.mockResolvedValue('signed-token');

    await expect(
      service.login({ email: 'user@example.com', password }),
    ).resolves.toEqual({ token: 'signed-token', userId: 'user-id' });
    expect(verify).toHaveBeenCalledWith(password, 'stored-hash');
  });

  it('rejects a password exceeding 72 UTF-8 bytes with the generic 401', async () => {
    findFirst.mockResolvedValue({ id: 'user-id', passwordHash: 'stored-hash' });
    verifyUnknownUser.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'user@example.com',
        password: '€'.repeat(25),
      }),
    ).rejects.toEqual(new UnauthorizedException('Invalid email or password'));
    expect(verify).not.toHaveBeenCalled();
    expect(verifyUnknownUser).toHaveBeenCalledWith('rejected-overlong-input');
  });

  it('returns the same generic 401 for a wrong password', async () => {
    findFirst.mockResolvedValue({ id: 'user-id', passwordHash: 'stored-hash' });
    verify.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'user@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toEqual(new UnauthorizedException('Invalid email or password'));
  });

  it('performs dummy verification and returns the generic 401 for unknown email', async () => {
    findFirst.mockResolvedValue(null);
    verifyUnknownUser.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'missing@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toEqual(new UnauthorizedException('Invalid email or password'));
    expect(verifyUnknownUser).toHaveBeenCalledWith('wrong-password');
  });

  it('does not authenticate a user without provisioned credentials', async () => {
    findFirst.mockResolvedValue({ id: 'user-id', passwordHash: null });
    verifyUnknownUser.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'user@example.com',
        password: 'test-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signAsync).not.toHaveBeenCalled();
  });
});
