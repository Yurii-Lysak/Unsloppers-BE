import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtStrategy } from '../jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  const findUnique = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: { user: { findUnique } } },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn(() => 'test-jwt-secret') },
        },
      ],
    }).compile();
    strategy = module.get(JwtStrategy);
  });

  it('resolves an existing JWT subject to the C7 shape', async () => {
    findUnique.mockResolvedValue({ id: 'user-id' });

    await expect(strategy.validate({ sub: 'user-id' })).resolves.toEqual({
      userId: 'user-id',
    });
  });

  it('rejects a JWT whose user was deleted', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'deleted-user' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
