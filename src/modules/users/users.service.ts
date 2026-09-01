import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PublicUser } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<PublicUser> {
    try {
      const user = await this.prisma.user.create({ data: createUserDto });
      return this.toPublicUser(user);
    } catch (error) {
      this.rethrowKnownErrors(error);
    }
  }

  async findAll(): Promise<PublicUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.toPublicUser(user));
  }

  async findOne(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }
    return this.toPublicUser(user);
  }

  /** Bootcamp Story 1.8 — self-only reads; no user directory listing. */
  async findOneForViewer(
    viewerUserId: string,
    id: string,
  ): Promise<PublicUser> {
    if (viewerUserId !== id) {
      throw new ForbiddenException('May only read your own user record');
    }
    return this.findOne(id);
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<PublicUser> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: updateUserDto,
      });
      return this.toPublicUser(user);
    } catch (error) {
      this.rethrowKnownErrors(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      this.rethrowKnownErrors(error);
    }
  }

  /** Strips identity and credential hashes before every HTTP response. */
  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      countryCode: user.countryCode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // Maps known Prisma error codes to HTTP exceptions; rethrows everything else
  private rethrowKnownErrors(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('User with this email already exists');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('User not found');
      }
    }
    throw error;
  }
}
