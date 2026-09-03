import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProjectAssignmentService } from '../project-assignment.service';
import { ProjectAssignment as ProjectAssignmentRow } from '../../../generated/prisma/client';
import {
  invokeRelationshipGraphBump,
  registerRelationshipGraphBump,
  resetRelationshipGraphBumpRegistry,
} from '../../../prisma/relationship-graph-bump.registry';

describe('ProjectAssignmentService', () => {
  let service: ProjectAssignmentService;

  const prisma = {
    projectAssignment: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const row: ProjectAssignmentRow = {
    id: 'row-1',
    employeeId: 'B',
    projectId: 'proj-1',
    pmId: 'P',
    dmId: 'D',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: null,
    confirmed: true,
    confirmedAt: new Date('2026-08-31T10:00:00.000Z'),
    source: 'manual',
    sourceKey: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectAssignmentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ProjectAssignmentService);
  });

  describe('listByEmployee', () => {
    it('returns rows mapped to the DTO shape (ISO strings, C3 real domain data)', async () => {
      prisma.projectAssignment.findMany.mockResolvedValue([row]);

      const result = await service.listByEmployee('B');

      expect(prisma.projectAssignment.findMany).toHaveBeenCalledWith({
        where: { employeeId: 'B' },
      });
      expect(result).toEqual([
        {
          employeeId: 'B',
          projectId: 'proj-1',
          pmId: 'P',
          dmId: 'D',
          startDate: row.startDate.toISOString(),
          endDate: null,
          confirmed: true,
          confirmedAt: row.confirmedAt!.toISOString(),
        },
      ]);
    });

    it('returns an empty array when the employee has no assignments', async () => {
      prisma.projectAssignment.findMany.mockResolvedValue([]);

      const result = await service.listByEmployee('nobody');

      expect(result).toEqual([]);
    });
  });

  describe('listByProject', () => {
    it('returns rows for the given project mapped to the DTO shape', async () => {
      prisma.projectAssignment.findMany.mockResolvedValue([row]);

      const result = await service.listByProject('proj-1');

      expect(prisma.projectAssignment.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
      });
      expect(result[0].projectId).toBe('proj-1');
    });
  });

  describe('create', () => {
    it('defaults confirmed/confirmedAt to false/null when omitted', async () => {
      prisma.projectAssignment.create.mockResolvedValue({
        ...row,
        confirmed: false,
        confirmedAt: null,
      });

      await service.create({
        employeeId: 'B',
        projectId: 'proj-1',
        pmId: 'P',
        dmId: 'D',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
      });

      expect(prisma.projectAssignment.create).toHaveBeenCalledWith({
        data: {
          employeeId: 'B',
          projectId: 'proj-1',
          pmId: 'P',
          dmId: 'D',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: null,
          confirmed: false,
          confirmedAt: null,
        },
      });
    });

    it('accepts caller-supplied confirmed/confirmedAt to produce an already-confirmed row directly', async () => {
      const confirmedAt = new Date('2026-08-31T10:00:00.000Z');
      prisma.projectAssignment.create.mockResolvedValue({
        ...row,
        confirmed: true,
        confirmedAt,
      });

      const result = await service.create({
        employeeId: 'B',
        projectId: 'proj-1',
        pmId: 'P',
        dmId: 'D',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        confirmed: true,
        confirmedAt,
      });

      expect(prisma.projectAssignment.create).toHaveBeenCalledWith({
        data: {
          employeeId: 'B',
          projectId: 'proj-1',
          pmId: 'P',
          dmId: 'D',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: null,
          confirmed: true,
          confirmedAt,
        },
      });
      expect(result.confirmed).toBe(true);
      expect(result.confirmedAt).toBe(confirmedAt.toISOString());
    });
  });

  describe('update', () => {
    it('patches endDate, confirmed, and confirmedAt through Prisma', async () => {
      const endDate = new Date('2026-09-01T00:00:00.000Z');
      prisma.projectAssignment.update.mockResolvedValue({
        ...row,
        endDate,
        confirmed: false,
        confirmedAt: null,
      });

      const result = await service.update('row-1', {
        endDate,
        confirmed: false,
        confirmedAt: null,
      });

      expect(prisma.projectAssignment.update).toHaveBeenCalledWith({
        where: { id: 'row-1' },
        data: { endDate, confirmed: false, confirmedAt: null },
      });
      expect(result.endDate).toBe(endDate.toISOString());
      expect(result.confirmed).toBe(false);
    });

    it('routes lifecycle patches through Prisma so the relationship-graph extension can bump generation', async () => {
      const bump = jest.fn();
      resetRelationshipGraphBumpRegistry();
      registerRelationshipGraphBump(bump);
      prisma.projectAssignment.update.mockImplementation(
        async (args: { data: Partial<ProjectAssignmentRow> }) => {
          await invokeRelationshipGraphBump();
          return { ...row, ...args.data };
        },
      );

      await service.update('row-1', { confirmed: false });

      expect(prisma.projectAssignment.update).toHaveBeenCalled();
      expect(bump).toHaveBeenCalledTimes(1);
      resetRelationshipGraphBumpRegistry();
    });
  });
});
