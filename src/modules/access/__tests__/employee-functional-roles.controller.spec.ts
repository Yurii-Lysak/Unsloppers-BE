import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { PERMISSION_KEYS } from '../../contracts/permission-keys';
import { CurrentUserProvider } from '../../contracts/current-user-provider.contract';
import { PermissionChecker } from '../../contracts/permission-checker.contract';
import { EmployeeFunctionalRolesController } from '../employee-functional-roles.controller';
import { FunctionalRoleAssignmentService } from '../functional-role-assignment.service';

describe('EmployeeFunctionalRolesController', () => {
  let controller: EmployeeFunctionalRolesController;

  const assignments = {
    listForEmployee: jest.fn(),
    setAssignments: jest.fn(),
  };

  const permissionChecker = {
    hasPermission: jest.fn(),
    getGrantedPermissions: jest.fn(),
  };

  const currentUser = {
    getCurrentUser: jest.fn(),
  };

  const request = {} as Request;
  const employeeId = '4f1e6f2e-8bcb-4a9f-b1b6-6c9f2d3a1e00';
  const roleId = '5f1e6f2e-8bcb-4a9f-b1b6-6c9f2d3a1e01';

  beforeEach(async () => {
    jest.clearAllMocks();
    currentUser.getCurrentUser.mockResolvedValue({ userId: 'user-1' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeFunctionalRolesController],
      providers: [
        { provide: FunctionalRoleAssignmentService, useValue: assignments },
        { provide: PermissionChecker, useValue: permissionChecker },
        { provide: CurrentUserProvider, useValue: currentUser },
      ],
    }).compile();

    controller = module.get(EmployeeFunctionalRolesController);
  });

  it('list returns assignments for HR Admin', async () => {
    permissionChecker.hasPermission.mockResolvedValue(true);
    assignments.listForEmployee.mockResolvedValue([]);

    await expect(controller.list(request, employeeId)).resolves.toEqual([]);
    expect(assignments.listForEmployee).toHaveBeenCalledWith(employeeId);
  });

  it('list rejects callers without manage_functional_roles', async () => {
    permissionChecker.hasPermission.mockResolvedValue(false);

    await expect(controller.list(request, employeeId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('replace delegates to setAssignments with caller user id', async () => {
    permissionChecker.hasPermission.mockResolvedValue(true);
    assignments.setAssignments.mockResolvedValue([]);

    await expect(
      controller.replace(request, employeeId, { roleIds: [roleId] }),
    ).resolves.toEqual([]);

    expect(assignments.setAssignments).toHaveBeenCalledWith(
      employeeId,
      [roleId],
      { callerUserId: 'user-1' },
    );
  });

  it('replace rejects callers without manage_functional_roles', async () => {
    permissionChecker.hasPermission.mockResolvedValue(false);

    await expect(
      controller.replace(request, employeeId, { roleIds: [roleId] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissionChecker.hasPermission).toHaveBeenCalledWith(
      'user-1',
      PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES,
    );
  });
});
