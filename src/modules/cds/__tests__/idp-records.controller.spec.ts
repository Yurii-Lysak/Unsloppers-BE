import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { CurrentUserProvider } from '../../contracts/current-user-provider.contract';
import { PermissionChecker } from '../../contracts/permission-checker.contract';
import { SectionAccessGate } from '../../contracts/section-access-gate.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { CdsService } from '../cds.service';
import { IdpRecordsController } from '../idp-records.controller';

describe('IdpRecordsController', () => {
  let controller: IdpRecordsController;
  const cds = {
    createIdpRecord: jest.fn(),
    updateIdpRecord: jest.fn(),
    completeIdpRecord: jest.fn(),
  };
  const currentUser = {
    getCurrentUser: jest.fn(),
  };
  const prisma = {
    employee: {
      findUnique: jest.fn(),
    },
  };
  const sectionGate = {
    requireSection: jest.fn(),
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };
  const permissionChecker = {
    hasPermission: jest.fn(),
  };

  const request = {} as never;
  const subjectEmployeeId = 'subject-employee-id';
  const viewerEmployeeId = 'viewer-employee-id';
  const idpId = 'idp-record-id';

  beforeEach(async () => {
    jest.clearAllMocks();
    currentUser.getCurrentUser.mockResolvedValue({ userId: 'user-1' });
    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { userId?: string; id?: string } }) => {
        if (where.userId === 'user-1') {
          return Promise.resolve({ id: viewerEmployeeId });
        }
        if (where.id === subjectEmployeeId) {
          return Promise.resolve({ id: subjectEmployeeId });
        }
        return Promise.resolve(null);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdpRecordsController],
      providers: [
        { provide: CdsService, useValue: cds },
        { provide: CurrentUserProvider, useValue: currentUser },
        { provide: PrismaService, useValue: prisma },
        { provide: SectionAccessGate, useValue: sectionGate },
        { provide: AccessResolver, useValue: accessResolver },
        { provide: PermissionChecker, useValue: permissionChecker },
      ],
    }).compile();

    controller = module.get(IdpRecordsController);
  });

  it('create allows ReportingLine RW viewers', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      sections: { S12: 'RW' },
    });
    cds.createIdpRecord.mockResolvedValue({
      id: idpId,
      description: 'Plan',
      deadline: '2026-12-01',
      fileUrl: 'https://example.com/idp',
      completedAt: null,
    });

    await expect(
      controller.create(request, subjectEmployeeId, {
        description: 'Plan',
        deadline: '2026-12-01',
        fileUrl: 'https://example.com/idp',
      }),
    ).resolves.toEqual({
      id: idpId,
      description: 'Plan',
      deadline: '2026-12-01',
      fileUrl: 'https://example.com/idp',
      completedAt: null,
    });
  });

  it('create returns 403 when viewer lacks RW and maintain permission', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      sections: { S12: 'R' },
    });
    permissionChecker.hasPermission.mockResolvedValue(false);

    await expect(
      controller.create(request, subjectEmployeeId, {
        description: 'Plan',
        deadline: '2026-12-01',
        fileUrl: 'https://example.com/idp',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('create allows maintain_cds_records viewers when S12 is readable', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      sections: { S12: 'R' },
    });
    permissionChecker.hasPermission.mockResolvedValue(true);
    cds.createIdpRecord.mockResolvedValue({
      id: idpId,
      description: 'Plan',
      deadline: '2026-12-01',
      fileUrl: 'https://example.com/idp',
      completedAt: null,
    });

    await expect(
      controller.create(request, subjectEmployeeId, {
        description: 'Plan',
        deadline: '2026-12-01',
        fileUrl: 'https://example.com/idp',
      }),
    ).resolves.toEqual({
      id: idpId,
      description: 'Plan',
      deadline: '2026-12-01',
      fileUrl: 'https://example.com/idp',
      completedAt: null,
    });
  });

  it('complete is self-only', async () => {
    await expect(
      controller.complete(request, subjectEmployeeId, idpId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('complete delegates to service for self viewers', async () => {
    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { userId?: string; id?: string } }) => {
        if (where.userId === 'user-1') {
          return Promise.resolve({ id: subjectEmployeeId });
        }
        if (where.id === subjectEmployeeId) {
          return Promise.resolve({ id: subjectEmployeeId });
        }
        return Promise.resolve(null);
      },
    );
    sectionGate.requireSection.mockResolvedValue({
      role: 'Self',
      sections: { S12: 'R' },
    });
    cds.completeIdpRecord.mockResolvedValue({
      id: idpId,
      description: 'Plan',
      deadline: '2026-12-01',
      fileUrl: 'https://example.com/idp',
      completedAt: '2026-09-09T12:00:00.000Z',
    });

    await expect(
      controller.complete(request, subjectEmployeeId, idpId),
    ).resolves.toEqual({
      id: idpId,
      description: 'Plan',
      deadline: '2026-12-01',
      fileUrl: 'https://example.com/idp',
      completedAt: '2026-09-09T12:00:00.000Z',
    });
  });

  it('update returns 404 when subject employee is missing', async () => {
    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { userId?: string; id?: string } }) => {
        if (where.userId === 'user-1') {
          return Promise.resolve({ id: viewerEmployeeId });
        }
        return Promise.resolve(null);
      },
    );

    await expect(
      controller.update(request, subjectEmployeeId, idpId, {
        description: 'Updated plan',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('complete returns 404 when subject employee is missing', async () => {
    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { userId?: string; id?: string } }) => {
        if (where.userId === 'user-1') {
          return Promise.resolve({ id: viewerEmployeeId });
        }
        return Promise.resolve(null);
      },
    );

    await expect(
      controller.complete(request, subjectEmployeeId, idpId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create returns 404 when subject employee is missing', async () => {
    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { userId?: string; id?: string } }) => {
        if (where.userId === 'user-1') {
          return Promise.resolve({ id: viewerEmployeeId });
        }
        return Promise.resolve(null);
      },
    );

    await expect(
      controller.create(request, subjectEmployeeId, {
        description: 'Plan',
        deadline: '2026-12-01',
        fileUrl: 'https://example.com/idp',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
