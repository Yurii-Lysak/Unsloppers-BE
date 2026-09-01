import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmployeesService } from '../employees.service';

describe('EmployeesService', () => {
  let service: EmployeesService;

  const prisma = {
    employee: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(EmployeesService);
  });

  it('list maps employees to displayName with email fallback', async () => {
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'emp-1',
        user: { name: 'Anton Savchenko', email: 'anton@example.com' },
      },
      {
        id: 'emp-2',
        user: { name: null, email: 'no-name@example.com' },
      },
    ]);

    await expect(service.list()).resolves.toEqual([
      { id: 'emp-1', displayName: 'Anton Savchenko' },
      { id: 'emp-2', displayName: 'no-name@example.com' },
    ]);
  });

  it('getById returns a single employee summary', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'emp-1',
      user: { name: 'Anton Savchenko', email: 'anton@example.com' },
    });

    await expect(service.getById('emp-1')).resolves.toEqual({
      id: 'emp-1',
      displayName: 'Anton Savchenko',
    });
  });

  it('getById rejects unknown employees', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(service.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
