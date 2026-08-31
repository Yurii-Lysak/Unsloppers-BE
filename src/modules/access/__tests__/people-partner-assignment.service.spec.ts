import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { PeoplePartnerAssignmentService } from '../people-partner-assignment.service';

describe('PeoplePartnerAssignmentService', () => {
  let service: PeoplePartnerAssignmentService;

  const prisma = {
    employee: {
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeoplePartnerAssignmentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PeoplePartnerAssignmentService);
  });

  it('assign sets peoplePartnerId on the subject employee', async () => {
    prisma.employee.update.mockResolvedValue({
      id: 'B',
      peoplePartnerId: 'X',
    });

    const result = await service.assign('B', 'X');

    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'B' },
      data: { peoplePartnerId: 'X' },
      select: { id: true, peoplePartnerId: true },
    });
    expect(result).toEqual({ subjectId: 'B', peoplePartnerId: 'X' });
  });

  it('assign clears peoplePartnerId when null is passed', async () => {
    prisma.employee.update.mockResolvedValue({
      id: 'B',
      peoplePartnerId: null,
    });

    const result = await service.assign('B', null);

    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'B' },
      data: { peoplePartnerId: null },
      select: { id: true, peoplePartnerId: true },
    });
    expect(result).toEqual({ subjectId: 'B', peoplePartnerId: null });
  });

  it('reassign replaces the previous PP id', async () => {
    prisma.employee.update.mockResolvedValue({
      id: 'B',
      peoplePartnerId: 'Y',
    });

    const result = await service.assign('B', 'Y');

    expect(result.peoplePartnerId).toBe('Y');
  });
});
