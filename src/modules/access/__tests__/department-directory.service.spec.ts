import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { DepartmentDirectoryService } from '../department-directory.service';

describe('DepartmentDirectoryService', () => {
  let service: DepartmentDirectoryService;

  const prisma = {
    department: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentDirectoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DepartmentDirectoryService);
  });

  describe('getDepartmentByName', () => {
    it('returns the mapped DTO when a department with that name exists', async () => {
      prisma.department.findUnique.mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'um-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getDepartmentByName('Engineering');

      expect(prisma.department.findUnique).toHaveBeenCalledWith({
        where: { name: 'Engineering' },
      });
      expect(result).toEqual({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'um-1',
      });
    });

    it('returns null when no department matches the name', async () => {
      prisma.department.findUnique.mockResolvedValue(null);

      const result = await service.getDepartmentByName('Nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getManagedDepartmentIds', () => {
    it('returns the direct managed department id when there are no children', async () => {
      prisma.department.findMany
        .mockResolvedValueOnce([{ id: 'dept-1' }])
        .mockResolvedValueOnce([]);

      const result = await service.getManagedDepartmentIds('um-1');

      expect(prisma.department.findMany).toHaveBeenNthCalledWith(1, {
        where: { managerId: 'um-1' },
        select: { id: true },
      });
      expect(result).toEqual(['dept-1']);
    });

    it('returns an empty array when the employee manages no department', async () => {
      prisma.department.findMany.mockResolvedValueOnce([]);

      const result = await service.getManagedDepartmentIds('nobody');

      expect(result).toEqual([]);
    });

    it('walks nested children to include descendant department ids', async () => {
      prisma.department.findMany
        .mockResolvedValueOnce([{ id: 'dept-1' }]) // direct
        .mockResolvedValueOnce([{ id: 'dept-2' }]) // children of dept-1
        .mockResolvedValueOnce([{ id: 'dept-3' }]) // children of dept-2
        .mockResolvedValueOnce([]); // no more children

      const result = await service.getManagedDepartmentIds('um-1');

      expect(result.sort()).toEqual(['dept-1', 'dept-2', 'dept-3'].sort());
      expect(prisma.department.findMany).toHaveBeenCalledTimes(4);
    });
  });
});
