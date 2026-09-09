import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { CurrentUserProvider } from '../../contracts/current-user-provider.contract';
import { PermissionChecker } from '../../contracts/permission-checker.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { CdsAssessmentsController } from '../cds-assessments.controller';
import { CdsService } from '../cds.service';

describe('CdsAssessmentsController', () => {
  let controller: CdsAssessmentsController;
  const cds = {
    createAssessment: jest.fn(),
    updateAssessmentConclusion: jest.fn(),
  };
  const currentUser = {
    getCurrentUser: jest.fn(),
  };
  const prisma = {
    employee: {
      findUnique: jest.fn(),
    },
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
  const assessmentId = 'assessment-id';

  const createPayload = {
    date: '2026-07-01',
    assessor: 'Assessment Manager',
    resultLink: 'https://skills-matrix.example/results/new',
    conclusion: 'New assessment conclusion',
  };

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
      controllers: [CdsAssessmentsController],
      providers: [
        { provide: CdsService, useValue: cds },
        { provide: CurrentUserProvider, useValue: currentUser },
        { provide: PrismaService, useValue: prisma },
        { provide: AccessResolver, useValue: accessResolver },
        { provide: PermissionChecker, useValue: permissionChecker },
      ],
    }).compile();

    controller = module.get(CdsAssessmentsController);
  });

  it('create allows ReportingLine RW viewers', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      sections: { S12: 'RW' },
    });
    cds.createAssessment.mockResolvedValue({
      id: assessmentId,
      ...createPayload,
      createdAt: '2026-07-02T10:00:00.000Z',
    });

    await expect(
      controller.create(request, subjectEmployeeId, createPayload),
    ).resolves.toEqual({
      id: assessmentId,
      ...createPayload,
      createdAt: '2026-07-02T10:00:00.000Z',
    });
  });

  it('create returns 403 when viewer lacks RW and maintain permission', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      sections: { S12: 'R' },
    });
    permissionChecker.hasPermission.mockResolvedValue(false);

    await expect(
      controller.create(request, subjectEmployeeId, createPayload),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('create allows maintain_cds_records viewers when S12 is readable', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      sections: { S12: 'R' },
    });
    permissionChecker.hasPermission.mockResolvedValue(true);
    cds.createAssessment.mockResolvedValue({
      id: assessmentId,
      ...createPayload,
      createdAt: '2026-07-02T10:00:00.000Z',
    });

    await expect(
      controller.create(request, subjectEmployeeId, createPayload),
    ).resolves.toEqual({
      id: assessmentId,
      ...createPayload,
      createdAt: '2026-07-02T10:00:00.000Z',
    });
  });

  it('create returns 403 when maintain_cds_records holder has no S12 access', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      sections: { S12: 'none' },
    });
    permissionChecker.hasPermission.mockResolvedValue(true);

    await expect(
      controller.create(request, subjectEmployeeId, createPayload),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updateConclusion allows ReportingLine RW viewers', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      sections: { S12: 'RW' },
    });
    cds.updateAssessmentConclusion.mockResolvedValue({
      id: assessmentId,
      date: '2026-06-15',
      assessor: 'Assessment Manager',
      resultLink: 'https://skills-matrix.example/results/1',
      conclusion: 'Updated conclusion',
      createdAt: '2026-06-16T10:00:00.000Z',
    });

    await expect(
      controller.updateConclusion(request, subjectEmployeeId, assessmentId, {
        conclusion: 'Updated conclusion',
      }),
    ).resolves.toEqual({
      id: assessmentId,
      date: '2026-06-15',
      assessor: 'Assessment Manager',
      resultLink: 'https://skills-matrix.example/results/1',
      conclusion: 'Updated conclusion',
      createdAt: '2026-06-16T10:00:00.000Z',
    });
  });

  it('updateConclusion allows maintain_cds_records viewers when S12 is readable', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      sections: { S12: 'R' },
    });
    permissionChecker.hasPermission.mockResolvedValue(true);
    cds.updateAssessmentConclusion.mockResolvedValue({
      id: assessmentId,
      date: '2026-06-15',
      assessor: 'Assessment Manager',
      resultLink: 'https://skills-matrix.example/results/1',
      conclusion: 'Updated via maintain permission',
      createdAt: '2026-06-16T10:00:00.000Z',
    });

    await expect(
      controller.updateConclusion(request, subjectEmployeeId, assessmentId, {
        conclusion: 'Updated via maintain permission',
      }),
    ).resolves.toEqual({
      id: assessmentId,
      date: '2026-06-15',
      assessor: 'Assessment Manager',
      resultLink: 'https://skills-matrix.example/results/1',
      conclusion: 'Updated via maintain permission',
      createdAt: '2026-06-16T10:00:00.000Z',
    });
  });

  it('updateConclusion returns 403 when viewer lacks write access', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      sections: { S12: 'none' },
    });
    permissionChecker.hasPermission.mockResolvedValue(false);

    await expect(
      controller.updateConclusion(request, subjectEmployeeId, assessmentId, {
        conclusion: 'Updated conclusion',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
      controller.create(request, subjectEmployeeId, createPayload),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateConclusion returns 404 when subject employee is missing', async () => {
    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { userId?: string; id?: string } }) => {
        if (where.userId === 'user-1') {
          return Promise.resolve({ id: viewerEmployeeId });
        }
        return Promise.resolve(null);
      },
    );

    await expect(
      controller.updateConclusion(request, subjectEmployeeId, assessmentId, {
        conclusion: 'Updated conclusion',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
