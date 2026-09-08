import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { SectionAccessGate } from '../../contracts/section-access-gate.contract';
import { RisksDashboardService } from '../risks-dashboard.service';

describe('RisksDashboardService', () => {
  let service: RisksDashboardService;
  const sectionGate = {
    canAccessRiskDashboard: jest.fn(),
    listS6SubjectIds: jest.fn(),
  };
  const prisma = {
    riskRecord: { findMany: jest.fn() },
    employee: { findMany: jest.fn(), findUnique: jest.fn() },
    projectAssignment: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RisksDashboardService,
        { provide: SectionAccessGate, useValue: sectionGate },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(RisksDashboardService);
  });

  it('returns canAccess false when the viewer has no S6 subjects', async () => {
    sectionGate.canAccessRiskDashboard.mockResolvedValue(false);

    await expect(service.getAccess('viewer-1')).resolves.toEqual({
      canAccess: false,
    });
  });

  it('builds active-risk counts and omits subjects without history', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['sub-1', 'sub-2', 'sub-3']);
    prisma.riskRecord.findMany.mockResolvedValue([
      {
        subjectEmployeeId: 'sub-1',
        level: 'high',
        recordedAt: new Date('2026-01-04T00:00:00.000Z'),
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
        id: 'r1',
      },
      {
        subjectEmployeeId: 'sub-2',
        level: 'low',
        recordedAt: new Date('2026-01-03T00:00:00.000Z'),
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        id: 'r2',
      },
    ]);
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        managerId: null,
        peoplePartnerId: null,
        user: { name: 'High Risk', email: 'high@example.com' },
        manager: null,
        peoplePartner: null,
        departmentHistory: [],
        projectAssignments: [],
      },
      {
        id: 'sub-2',
        managerId: null,
        peoplePartnerId: null,
        user: { name: 'Low Risk', email: 'low@example.com' },
        manager: null,
        peoplePartner: null,
        departmentHistory: [],
        projectAssignments: [],
      },
    ]);

    const result = await service.getDashboard('pp-1', {});

    expect(result.counts).toEqual({
      need_attention: 0,
      medium: 0,
      high: 1,
      leaver: 0,
      totalActive: 1,
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.employeeId)).toEqual([
      'sub-1',
      'sub-2',
    ]);
  });

  it('filters rows by level without changing counts', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['sub-1', 'sub-2']);
    prisma.riskRecord.findMany.mockResolvedValue([
      {
        subjectEmployeeId: 'sub-1',
        level: 'high',
        recordedAt: new Date('2026-01-04T00:00:00.000Z'),
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
        id: 'r1',
      },
      {
        subjectEmployeeId: 'sub-2',
        level: 'medium',
        recordedAt: new Date('2026-01-03T00:00:00.000Z'),
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        id: 'r2',
      },
    ]);
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        managerId: null,
        peoplePartnerId: null,
        user: { name: 'High', email: 'high@example.com' },
        manager: null,
        peoplePartner: null,
        departmentHistory: [],
        projectAssignments: [],
      },
      {
        id: 'sub-2',
        managerId: null,
        peoplePartnerId: null,
        user: { name: 'Medium', email: 'medium@example.com' },
        manager: null,
        peoplePartner: null,
        departmentHistory: [],
        projectAssignments: [],
      },
    ]);

    const result = await service.getDashboard('pp-1', { level: 'high' });

    expect(result.counts.totalActive).toBe(2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.currentLevel).toBe('high');
  });

  it('rejects unknown manager filter ids', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(
      service.getDashboard('pp-1', {
        managerId: '00000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
