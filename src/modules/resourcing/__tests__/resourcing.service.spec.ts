import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ResourcingService } from '../resourcing.service';

type PrismaMock = {
  resourcingRequest: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
  projectAssignment: {
    findMany: jest.Mock;
  };
};

describe('ResourcingService', () => {
  let service: ResourcingService;
  const clock: Clock = {
    now: () => new Date('2026-09-08T12:00:00.000Z'),
    nowMs: () => new Date('2026-09-08T12:00:00.000Z').getTime(),
  };
  const prisma: PrismaMock = {
    resourcingRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    projectAssignment: {
      findMany: jest.fn(),
    },
  };

  const authorInclude = {
    author: {
      include: {
        user: { select: { name: true, email: true } },
      },
    },
  };

  const validPayload = {
    vacancyDetails: '  Need a senior backend engineer  ',
    expectedCompBand: '  $80k-$100k  ',
    duration: '  6 months  ',
    workload: '  Full-time  ',
    headcount: 2,
    department: '  Engineering  ',
    projectId: '  project-alpha  ',
  };

  const requestRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'request-1',
    authorId: 'author-1',
    vacancyDetails: 'Need a senior backend engineer',
    expectedCompBand: '$80k-$100k',
    duration: '6 months',
    workload: 'Full-time',
    headcount: 2,
    department: 'Engineering',
    projectId: 'project-alpha',
    status: 'open',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    author: {
      id: 'author-1',
      user: { name: 'Project Manager', email: 'pm@example.com' },
    },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.projectAssignment.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcingService,
        { provide: PrismaService, useValue: prisma },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(ResourcingService);
  });

  it('creates an open request and returns comp band to the author', async () => {
    prisma.resourcingRequest.create.mockResolvedValue(requestRow());

    const result = await service.createRequest(
      'author-1',
      'author-1',
      validPayload,
    );

    expect(prisma.resourcingRequest.create).toHaveBeenCalledWith({
      data: {
        authorId: 'author-1',
        vacancyDetails: 'Need a senior backend engineer',
        expectedCompBand: '$80k-$100k',
        duration: '6 months',
        workload: 'Full-time',
        headcount: 2,
        department: 'Engineering',
        projectId: 'project-alpha',
        status: 'open',
      },
      include: authorInclude,
    });
    expect(result.status).toBe('open');
    expect(result.expectedCompBand).toBe('$80k-$100k');
  });

  it('lists only the viewer own requests when they are not a DM for any PM author', async () => {
    prisma.resourcingRequest.findMany.mockResolvedValue([
      requestRow({ id: 'own-request', authorId: 'viewer-1' }),
    ]);

    const result = await service.listRequests('viewer-1');

    expect(prisma.resourcingRequest.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { authorId: 'viewer-1' },
          {
            author: {
              pmProjectAssignments: {
                some: {
                  dmId: 'viewer-1',
                  OR: [
                    { endDate: null },
                    { endDate: { gte: new Date('2026-09-08T00:00:00.000Z') } },
                  ],
                },
              },
            },
          },
        ],
      },
      include: authorInclude,
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('own-request');
  });

  it('omits expectedCompBand for a non-author viewer without DM access to the project', async () => {
    prisma.resourcingRequest.findMany.mockResolvedValue([
      requestRow({ authorId: 'pm-1' }),
    ]);
    prisma.projectAssignment.findMany.mockResolvedValue([]);

    const result = await service.listRequests('viewer-dm');

    expect(result[0]?.expectedCompBand).toBeUndefined();
  });

  it('includes expectedCompBand when the viewer is DM on the request project', async () => {
    prisma.resourcingRequest.findMany.mockResolvedValue([
      requestRow({ authorId: 'pm-1', projectId: 'project-alpha' }),
    ]);
    prisma.projectAssignment.findMany.mockResolvedValue([
      { projectId: 'project-alpha' },
    ]);

    const result = await service.listRequests('viewer-dm');

    expect(result[0]?.expectedCompBand).toBe('$80k-$100k');
  });
});
