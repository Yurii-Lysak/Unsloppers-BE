import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  assertValidPermissionKeys,
  BUILT_IN_ROLE_NAMES,
  InvalidPermissionKeysError,
  PERMISSION_KEYS,
} from '../contracts/permission-keys';
import { PrismaService } from '../../prisma/prisma.service';
import { FunctionalRoleEntity } from './entities/functional-role.entity';

@Injectable()
export class FunctionalRoleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<FunctionalRoleEntity[]> {
    const roles = await this.prisma.functionalRole.findMany({
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
      include: { permissions: true },
    });
    return roles.map((role) => this.toEntity(role));
  }

  async create(
    name: string,
    permissionKeys: string[],
  ): Promise<FunctionalRoleEntity> {
    const normalizedName = this.normalizeName(name);
    await this.assertNameAvailable(normalizedName);

    let validatedKeys: string[];
    try {
      validatedKeys = assertValidPermissionKeys(permissionKeys);
    } catch (error) {
      if (error instanceof InvalidPermissionKeysError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    try {
      const role = await this.prisma.functionalRole.create({
        data: {
          name: normalizedName,
          isBuiltIn: false,
          permissions: {
            create: validatedKeys.map((permissionKey) => ({ permissionKey })),
          },
        },
        include: { permissions: true },
      });

      return this.toEntity(role);
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async update(
    roleId: string,
    input: { name?: string; permissionKeys?: string[] },
  ): Promise<FunctionalRoleEntity> {
    const role = await this.prisma.functionalRole.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException('Functional role not found');
    }

    if (input.name !== undefined) {
      if (role.isBuiltIn) {
        throw new BadRequestException('Built-in role names cannot be changed');
      }
      const normalizedName = this.normalizeName(input.name);
      if (normalizedName.toLowerCase() !== role.name.toLowerCase()) {
        await this.assertNameAvailable(normalizedName, roleId);
      }
    }

    if (input.permissionKeys !== undefined) {
      let validatedKeys: string[];
      try {
        validatedKeys = assertValidPermissionKeys(input.permissionKeys);
      } catch (error) {
        if (error instanceof InvalidPermissionKeysError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }

      if (
        role.isBuiltIn &&
        role.name === BUILT_IN_ROLE_NAMES.HR_ADMIN &&
        !validatedKeys.includes(PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES)
      ) {
        throw new BadRequestException(
          'The built-in HR Admin role must retain manage_functional_roles',
        );
      }

      return this.toEntity(
        await this.prisma.$transaction(async (tx) => {
          if (input.name !== undefined && !role.isBuiltIn) {
            try {
              await tx.functionalRole.update({
                where: { id: roleId },
                data: { name: this.normalizeName(input.name) },
              });
            } catch (error) {
              throw this.mapUniqueViolation(error);
            }
          }

          await tx.functionalRolePermission.deleteMany({ where: { roleId } });
          if (validatedKeys.length > 0) {
            await tx.functionalRolePermission.createMany({
              data: validatedKeys.map((permissionKey) => ({
                roleId,
                permissionKey,
              })),
            });
          }

          return tx.functionalRole.findUniqueOrThrow({
            where: { id: roleId },
            include: { permissions: true },
          });
        }),
      );
    }

    if (input.name !== undefined && !role.isBuiltIn) {
      try {
        const updated = await this.prisma.functionalRole.update({
          where: { id: roleId },
          data: { name: this.normalizeName(input.name) },
          include: { permissions: true },
        });
        return this.toEntity(updated);
      } catch (error) {
        throw this.mapUniqueViolation(error);
      }
    }

    return this.toEntity(role);
  }

  async delete(roleId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const role = await tx.functionalRole.findUnique({
        where: { id: roleId },
        include: { _count: { select: { assignments: true } } },
      });
      if (!role) {
        throw new NotFoundException('Functional role not found');
      }
      if (role.isBuiltIn) {
        throw new ConflictException('Built-in roles cannot be deleted');
      }
      if (role._count.assignments > 0) {
        throw new ConflictException(
          `Cannot delete a role that still has ${role._count.assignments} employee assignment(s)`,
        );
      }
      await tx.functionalRole.delete({ where: { id: roleId } });
    });
  }

  private normalizeName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Role name must not be empty');
    }
    return trimmed;
  }

  private async assertNameAvailable(
    name: string,
    excludeRoleId?: string,
  ): Promise<void> {
    const existing = await this.prisma.functionalRole.findMany({
      select: { id: true, name: true },
    });
    const clash = existing.find(
      (role) =>
        role.id !== excludeRoleId &&
        role.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      throw new ConflictException('A role with this name already exists');
    }
  }

  private mapUniqueViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('A role with this name already exists');
    }
    return error;
  }

  private toEntity(role: {
    id: string;
    name: string;
    isBuiltIn: boolean;
    permissions: { permissionKey: string }[];
  }): FunctionalRoleEntity {
    return {
      id: role.id,
      name: role.name,
      isBuiltIn: role.isBuiltIn,
      permissionKeys: role.permissions.map((p) => p.permissionKey).sort(),
    };
  }
}
