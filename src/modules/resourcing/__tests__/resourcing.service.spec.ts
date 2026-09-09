import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DepartmentDirectory } from '../../contracts/department-directory.contract';
import { ResourcingService } from '../resourcing.service';

describe('ResourcingService', () => {
  let service: ResourcingService;
  const clock: Clock = {
    now: () => new Date('2026-09-08T12:00:00.000Z'),
    nowMs: () => new Date('2026-09-08T12:00:00.000Z').getTime(),
  };

  const prisma = {
    resourcingRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    resourcingProposal: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    sharedLink: {
      findFirst: jest.fn(),
    },
    projectAssignment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    department: {
      findMany: jest.fn(),
    },
    departmentHistory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    employee: {
      findUnique: jest.fn(),
    },
    functionalRoleAssignment: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const departmentDirectory: DepartmentDirectory = {
    getDepartmentByName: jest.fn(),
    getManagedDepartmentIds: jest.fn(),
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
    reviewingDmId: null,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    author: {
      id: 'author-1',
      user: { name: 'Project Manager', email: 'pm@example.com' },
    },
    ...overrides,
  });

  // `decide()`'s inner `prisma.$transaction(async (tx) => ...)` callback runs
  // against this fake transaction client — tests configure `tx.*` directly.
  let tx: {
    $queryRaw: jest.Mock;
    resourcingProposal: {
      findUnique: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };

  const proposalRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'proposal-1',
    requestId: 'request-1',
    proposedById: 'um-1',
    candidateEmployeeId: null,
    peopleForceCandidateId: null,
    peopleForceCandidateUrl: 'https://peopleforce.example.com/candidates/1',
    status: 'proposed',
    decisionReason: null,
    createdAt: new Date('2026-09-05T00:00:00.000Z'),
    candidateEmployee: null,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.projectAssignment.findMany.mockResolvedValue([]);
    prisma.projectAssignment.findFirst.mockResolvedValue(null);
    prisma.sharedLink.findFirst.mockResolvedValue(null);
    (departmentDirectory.getDepartmentByName as jest.Mock).mockResolvedValue(
      null,
    );
    (
      departmentDirectory.getManagedDepartmentIds as jest.Mock
    ).mockResolvedValue([]);

    tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      resourcingProposal: {
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof tx) => unknown) => callback(tx),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcingService,
        { provide: PrismaService, useValue: prisma },
        { provide: Clock, useValue: clock },
        { provide: DepartmentDirectory, useValue: departmentDirectory },
      ],
    }).compile();

    service = module.get(ResourcingService);
  });

  describe('createRequest / listRequests (Story 6.1, unchanged behavior)', () => {
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
                      {
                        endDate: { gte: new Date('2026-09-08T00:00:00.000Z') },
                      },
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

    it('includes expectedCompBand when the viewer is the live routed Unit Manager (6.2 extension)', async () => {
      prisma.resourcingRequest.findMany.mockResolvedValue([
        requestRow({ authorId: 'pm-1' }),
      ]);
      (departmentDirectory.getDepartmentByName as jest.Mock).mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'um-1',
      });

      const result = await service.listRequests('um-1');

      expect(result[0]?.expectedCompBand).toBe('$80k-$100k');
    });
  });

  describe('listPendingReview', () => {
    it('returns only pending_dm_review requests assigned to the viewer as reviewing DM', async () => {
      prisma.resourcingRequest.findMany.mockResolvedValue([
        requestRow({
          id: 'pending-1',
          status: 'pending_dm_review',
          reviewingDmId: 'dm-1',
        }),
      ]);

      const result = await service.listPendingReview('dm-1');

      expect(prisma.resourcingRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'pending_dm_review',
            reviewingDmId: 'dm-1',
          },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('pending-1');
    });
  });

  describe('listAssigned', () => {
    it('returns only open requests routed to the viewer as current Unit Manager', async () => {
      prisma.resourcingRequest.findMany.mockResolvedValue([
        requestRow({ id: 'routed', department: 'Engineering' }),
        requestRow({ id: 'not-routed', department: 'Design' }),
      ]);
      (departmentDirectory.getDepartmentByName as jest.Mock).mockImplementation(
        (name: string) =>
          Promise.resolve(
            name === 'Engineering'
              ? { id: 'dept-1', name, parentId: null, managerId: 'um-1' }
              : {
                  id: 'dept-2',
                  name,
                  parentId: null,
                  managerId: 'someone-else',
                },
          ),
      );

      const result = await service.listAssigned('um-1');

      expect(prisma.resourcingRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'open' } }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('routed');
    });
  });

  describe('getDetail', () => {
    it('throws Forbidden (NOT_ROUTED) when the viewer is not the current department manager', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(requestRow());
      (departmentDirectory.getDepartmentByName as jest.Mock).mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'someone-else',
      });

      await expect(
        service.getDetail('um-1', 'request-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns proposals and a candidate pool scoped to the managed department for the routed UM', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(requestRow());
      (departmentDirectory.getDepartmentByName as jest.Mock).mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'um-1',
      });
      (
        departmentDirectory.getManagedDepartmentIds as jest.Mock
      ).mockResolvedValue(['dept-1']);
      prisma.department.findMany.mockResolvedValue([{ name: 'Engineering' }]);
      prisma.departmentHistory.findMany.mockResolvedValue([
        {
          employee: {
            id: 'candidate-1',
            employmentStatus: 'active',
            user: { name: 'Candidate One', email: 'c1@example.com' },
          },
        },
        {
          employee: {
            id: 'candidate-dismissed',
            employmentStatus: 'dismissed',
            user: { name: 'Gone', email: 'gone@example.com' },
          },
        },
      ]);
      prisma.resourcingProposal.findMany.mockResolvedValue([
        {
          id: 'proposal-1',
          requestId: 'request-1',
          proposedById: 'um-1',
          candidateEmployeeId: 'candidate-1',
          peopleForceCandidateId: null,
          peopleForceCandidateUrl: null,
          status: 'proposed',
          createdAt: new Date('2026-09-05T00:00:00.000Z'),
          candidateEmployee: {
            user: { name: 'Candidate One', email: 'c1@example.com' },
          },
        },
      ]);

      const result = await service.getDetail('um-1', 'request-1');

      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0]?.candidateDisplayName).toBe('Candidate One');
      expect(result.candidatePool).toEqual([
        { id: 'candidate-1', displayName: 'Candidate One' },
      ]);
      expect(result.reviewingDmId).toBeNull();
      expect(result.approvedCount).toBe(0);
      expect(result.viewerIsReviewingDm).toBe(false);
    });

    it('Story 6.3 — admits the resolved reviewing DM even when they are not the routed UM', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        requestRow({ reviewingDmId: 'dm-1' }),
      );
      // Viewer is not the department's live UM.
      (departmentDirectory.getDepartmentByName as jest.Mock).mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'um-1',
      });
      prisma.resourcingProposal.findMany.mockResolvedValue([
        {
          id: 'proposal-1',
          requestId: 'request-1',
          proposedById: 'um-1',
          candidateEmployeeId: 'candidate-1',
          peopleForceCandidateId: null,
          peopleForceCandidateUrl: null,
          status: 'approved',
          decisionReason: null,
          createdAt: new Date('2026-09-05T00:00:00.000Z'),
          candidateEmployee: {
            user: { name: 'Candidate One', email: 'c1@example.com' },
          },
        },
      ]);
      prisma.sharedLink.findFirst.mockResolvedValue({
        token: 'shared-token-1',
      });

      const result = await service.getDetail('dm-1', 'request-1');

      expect(result.viewerIsReviewingDm).toBe(true);
      expect(result.approvedCount).toBe(1);
      // Reviewing-DM view never gets a candidate pool — that's UM-only.
      expect(result.candidatePool).toBeUndefined();
      expect(result.proposals[0]?.sharedLinkToken).toBe('shared-token-1');
      const sharedLinkFindFirst = prisma.sharedLink.findFirst as jest.Mock<
        unknown,
        [{ where: { subjectEmployeeId: string; recipientEmployeeId: string } }]
      >;
      expect(sharedLinkFindFirst).toHaveBeenCalledTimes(1);
      const [{ where: sharedLinkWhere }] = sharedLinkFindFirst.mock.calls[0];
      expect(sharedLinkWhere.subjectEmployeeId).toBe('candidate-1');
      expect(sharedLinkWhere.recipientEmployeeId).toBe('dm-1');
    });

    it('omits candidatePool when the viewer is both the routed UM and the reviewing DM', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        requestRow({ reviewingDmId: 'um-1' }),
      );
      (departmentDirectory.getDepartmentByName as jest.Mock).mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'um-1',
      });
      prisma.resourcingProposal.findMany.mockResolvedValue([]);

      const result = await service.getDetail('um-1', 'request-1');

      expect(result.viewerIsReviewingDm).toBe(true);
      expect(result.candidatePool).toBeUndefined();
    });

    it('throws Forbidden when the viewer is neither the routed UM nor the reviewing DM', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        requestRow({ reviewingDmId: 'dm-1' }),
      );
      (departmentDirectory.getDepartmentByName as jest.Mock).mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'um-1',
      });

      await expect(
        service.getDetail('someone-else', 'request-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('never treats a null reviewingDmId as matching any viewer (REVIEWING_DM_UNRESOLVED gap)', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        requestRow({ reviewingDmId: null }),
      );
      (departmentDirectory.getDepartmentByName as jest.Mock).mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'um-1',
      });

      await expect(
        service.getDetail('not-a-um', 'request-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('decide', () => {
    const pendingRequestRow = (
      overrides: Partial<Record<string, unknown>> = {},
    ) =>
      requestRow({
        status: 'pending_dm_review',
        reviewingDmId: 'dm-1',
        headcount: 1,
        ...overrides,
      });

    it('NOT_REVIEWING_DM: rejects (403) when the viewer is not the resolved reviewing DM', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow(),
      );

      await expect(
        service.decide('someone-else', 'request-1', 'proposal-1', {
          decision: 'approved',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('REQUEST_NOT_PENDING: rejects (409) when the request is still open', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        requestRow({ status: 'open', reviewingDmId: 'dm-1' }),
      );

      await expect(
        service.decide('dm-1', 'request-1', 'proposal-1', {
          decision: 'approved',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('DECIDE_WRONG_REQUEST: rejects (404) when the proposal belongs to a different request', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow(),
      );
      prisma.resourcingProposal.findUnique.mockResolvedValue(
        proposalRow({ requestId: 'other-request' }),
      );

      await expect(
        service.decide('dm-1', 'request-1', 'proposal-1', {
          decision: 'approved',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('REJECT_NO_REASON: rejects (400) an empty-reason rejection', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow(),
      );
      prisma.resourcingProposal.findUnique.mockResolvedValue(proposalRow());

      await expect(
        service.decide('dm-1', 'request-1', 'proposal-1', {
          decision: 'rejected',
          reason: '   ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('REJECT_NO_REASON: rejects (400) reversing an approved proposal without a reason', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow(),
      );
      prisma.resourcingProposal.findUnique.mockResolvedValue(
        proposalRow({ status: 'approved' }),
      );

      await expect(
        service.decide('dm-1', 'request-1', 'proposal-1', {
          decision: 'rejected',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('REJECT_HAPPY: rejects a proposed candidate with a reason and stores it', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow(),
      );
      prisma.resourcingProposal.findUnique.mockResolvedValue(proposalRow());
      tx.resourcingProposal.findUnique.mockResolvedValue(proposalRow());
      tx.resourcingProposal.findUniqueOrThrow.mockResolvedValue(
        proposalRow({ status: 'rejected', decisionReason: 'Not a fit' }),
      );

      const result = await service.decide('dm-1', 'request-1', 'proposal-1', {
        decision: 'rejected',
        reason: '  Not a fit  ',
      });

      expect(tx.resourcingProposal.updateMany).toHaveBeenCalledWith({
        where: { id: 'proposal-1', status: 'proposed' },
        data: { status: 'rejected', decisionReason: 'Not a fit' },
      });
      expect(result.status).toBe('rejected');
      expect(result.decisionReason).toBe('Not a fit');
    });

    it('APPROVE_HAPPY: approves a proposed candidate under headcount', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow({ headcount: 2 }),
      );
      prisma.resourcingProposal.findUnique.mockResolvedValue(proposalRow());
      tx.resourcingProposal.findUnique.mockResolvedValue(proposalRow());
      tx.resourcingProposal.count.mockResolvedValue(0);
      tx.resourcingProposal.findUniqueOrThrow.mockResolvedValue(
        proposalRow({ status: 'approved' }),
      );

      const result = await service.decide('dm-1', 'request-1', 'proposal-1', {
        decision: 'approved',
      });

      expect(tx.resourcingProposal.updateMany).toHaveBeenCalledWith({
        where: { id: 'proposal-1', status: 'proposed' },
        data: { status: 'approved', decisionReason: null },
      });
      expect(result.status).toBe('approved');
    });

    it('APPROVE_HEADCOUNT_FULL: rejects (409) approval once approvedCount reaches headcount', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow({ headcount: 1 }),
      );
      prisma.resourcingProposal.findUnique.mockResolvedValue(proposalRow());
      tx.resourcingProposal.findUnique.mockResolvedValue(proposalRow());
      tx.resourcingProposal.count.mockResolvedValue(1);

      await expect(
        service.decide('dm-1', 'request-1', 'proposal-1', {
          decision: 'approved',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.resourcingProposal.updateMany).not.toHaveBeenCalled();
    });

    it('APPROVE_ALREADY_DECIDED: rejects (400) approving a proposal already approved', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow(),
      );
      prisma.resourcingProposal.findUnique.mockResolvedValue(
        proposalRow({ status: 'approved' }),
      );
      tx.resourcingProposal.findUnique.mockResolvedValue(
        proposalRow({ status: 'approved' }),
      );

      await expect(
        service.decide('dm-1', 'request-1', 'proposal-1', {
          decision: 'approved',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('REVERSE_APPROVAL: reverses an approved proposal to rejected with a reason, freeing the slot', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow({ headcount: 1 }),
      );
      prisma.resourcingProposal.findUnique.mockResolvedValue(
        proposalRow({ status: 'approved' }),
      );
      tx.resourcingProposal.findUnique.mockResolvedValue(
        proposalRow({ status: 'approved' }),
      );
      tx.resourcingProposal.findUniqueOrThrow.mockResolvedValue(
        proposalRow({ status: 'rejected', decisionReason: 'Ineligible' }),
      );

      const result = await service.decide('dm-1', 'request-1', 'proposal-1', {
        decision: 'rejected',
        reason: 'Ineligible',
      });

      expect(tx.resourcingProposal.updateMany).toHaveBeenCalledWith({
        where: { id: 'proposal-1', status: 'approved' },
        data: { status: 'rejected', decisionReason: 'Ineligible' },
      });
      expect(result.status).toBe('rejected');
    });

    it('REVIEWING_DM_UNRESOLVED: never treats a null reviewingDmId as matching any viewer (403, accepted gap)', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow({ reviewingDmId: null }),
      );

      await expect(
        service.decide('anyone', 'request-1', 'proposal-1', {
          decision: 'approved',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('DECIDE_ON_REJECTED: rejects (409) any further decision on a rejected proposal', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow(),
      );
      prisma.resourcingProposal.findUnique.mockResolvedValue(
        proposalRow({ status: 'rejected' }),
      );
      tx.resourcingProposal.findUnique.mockResolvedValue(
        proposalRow({ status: 'rejected' }),
      );

      await expect(
        service.decide('dm-1', 'request-1', 'proposal-1', {
          decision: 'approved',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.resourcingProposal.updateMany).not.toHaveBeenCalled();
    });

    it('rejects (409) when a concurrent decide already changed the proposal status (conditional update, rows-affected)', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        pendingRequestRow(),
      );
      prisma.resourcingProposal.findUnique.mockResolvedValue(proposalRow());
      tx.resourcingProposal.findUnique.mockResolvedValue(proposalRow());
      tx.resourcingProposal.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.decide('dm-1', 'request-1', 'proposal-1', {
          decision: 'approved',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createProposal', () => {
    const routeAsUm = () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(requestRow());
      (departmentDirectory.getDepartmentByName as jest.Mock).mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'um-1',
      });
    };

    it('rejects a proposal with neither an internal candidate nor an external link (400)', async () => {
      routeAsUm();

      await expect(
        service.createProposal('um-1', 'request-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an external proposal without a valid URL (EXTERNAL_NO_URL, 400)', async () => {
      routeAsUm();

      await expect(
        service.createProposal('um-1', 'request-1', {
          peopleForceCandidateUrl: 'not-a-url',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an internal candidate outside the managed department (INTERNAL_OUT_OF_UNIT, 400)', async () => {
      routeAsUm();
      prisma.departmentHistory.findFirst.mockResolvedValue({ value: 'Design' });
      (departmentDirectory.getDepartmentByName as jest.Mock).mockImplementation(
        (name: string) =>
          Promise.resolve(
            name === 'Engineering'
              ? { id: 'dept-1', name, parentId: null, managerId: 'um-1' }
              : { id: 'dept-2', name, parentId: null, managerId: null },
          ),
      );
      (
        departmentDirectory.getManagedDepartmentIds as jest.Mock
      ).mockResolvedValue(['dept-1']);

      await expect(
        service.createProposal('um-1', 'request-1', {
          candidateEmployeeId: 'candidate-out-of-unit',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates an internal proposal for a candidate inside the managed department (HAPPY_INTERNAL)', async () => {
      routeAsUm();
      prisma.departmentHistory.findFirst.mockResolvedValue({
        value: 'Engineering',
      });
      (
        departmentDirectory.getManagedDepartmentIds as jest.Mock
      ).mockResolvedValue(['dept-1']);
      prisma.resourcingProposal.create.mockResolvedValue({
        id: 'proposal-1',
        requestId: 'request-1',
        proposedById: 'um-1',
        candidateEmployeeId: 'candidate-1',
        peopleForceCandidateId: null,
        peopleForceCandidateUrl: null,
        status: 'proposed',
        createdAt: new Date('2026-09-05T00:00:00.000Z'),
        candidateEmployee: {
          user: { name: 'Candidate One', email: 'c1@example.com' },
        },
      });

      const result = await service.createProposal('um-1', 'request-1', {
        candidateEmployeeId: 'candidate-1',
      });

      expect(prisma.resourcingProposal.create).toHaveBeenCalledWith({
        data: {
          requestId: 'request-1',
          proposedById: 'um-1',
          candidateEmployeeId: 'candidate-1',
          peopleForceCandidateId: null,
          peopleForceCandidateUrl: null,
          status: 'proposed',
        },
        include: {
          candidateEmployee: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      });
      expect(result.candidateEmployeeId).toBe('candidate-1');
    });

    it('creates an external proposal from a valid PeopleForce link (HAPPY_EXTERNAL_LINK)', async () => {
      routeAsUm();
      prisma.resourcingProposal.create.mockResolvedValue({
        id: 'proposal-2',
        requestId: 'request-1',
        proposedById: 'um-1',
        candidateEmployeeId: null,
        peopleForceCandidateId: 'pf-123',
        peopleForceCandidateUrl:
          'https://peopleforce.example.com/candidates/123',
        status: 'proposed',
        createdAt: new Date('2026-09-05T00:00:00.000Z'),
        candidateEmployee: null,
      });

      const result = await service.createProposal('um-1', 'request-1', {
        peopleForceCandidateUrl:
          'https://peopleforce.example.com/candidates/123',
        peopleForceCandidateId: 'pf-123',
      });

      expect(result.candidateEmployeeId).toBeNull();
      expect(result.peopleForceCandidateUrl).toBe(
        'https://peopleforce.example.com/candidates/123',
      );
    });

    it('rejects new proposals once the request is no longer open (409)', async () => {
      prisma.resourcingRequest.findUnique.mockResolvedValue(
        requestRow({ status: 'pending_dm_review' }),
      );
      (departmentDirectory.getDepartmentByName as jest.Mock).mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'um-1',
      });

      await expect(
        service.createProposal('um-1', 'request-1', {
          peopleForceCandidateUrl:
            'https://peopleforce.example.com/candidates/1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('submit', () => {
    const routeAsUm = (overrides: Partial<Record<string, unknown>> = {}) => {
      const row = requestRow(overrides);
      prisma.resourcingRequest.findUnique.mockResolvedValue(row);
      (departmentDirectory.getDepartmentByName as jest.Mock).mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        parentId: null,
        managerId: 'um-1',
      });
      return row;
    };

    it('rejects submit with zero proposed proposals (SUBMIT_EMPTY, 400)', async () => {
      routeAsUm();
      prisma.resourcingProposal.count.mockResolvedValue(0);

      await expect(service.submit('um-1', 'request-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects submit when the request is not open (SUBMIT_NOT_OPEN, 409)', async () => {
      routeAsUm({ status: 'pending_dm_review' });

      await expect(service.submit('um-1', 'request-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('resolves the reviewing DM from the active project assignment when projectId is set', async () => {
      routeAsUm();
      prisma.resourcingProposal.count.mockResolvedValue(1);
      prisma.projectAssignment.findFirst.mockResolvedValue({
        dmId: 'dm-from-project',
      });
      prisma.resourcingProposal.findMany.mockResolvedValue([]);

      await service.submit('um-1', 'request-1');

      expect(prisma.resourcingRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-1' },
        data: { status: 'pending_dm_review', reviewingDmId: 'dm-from-project' },
      });
    });

    it('resolves the reviewing DM to the author when the author holds the DM role (no projectId)', async () => {
      routeAsUm({ projectId: null });
      prisma.resourcingProposal.count.mockResolvedValue(1);
      prisma.functionalRoleAssignment.count.mockResolvedValueOnce(1); // DM role check
      prisma.resourcingProposal.findMany.mockResolvedValue([]);

      await service.submit('um-1', 'request-1');

      expect(prisma.resourcingRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-1' },
        data: { status: 'pending_dm_review', reviewingDmId: 'author-1' },
      });
    });

    it("resolves the reviewing DM to the PM author's manager when neither project nor DM role apply", async () => {
      routeAsUm({ projectId: null });
      prisma.resourcingProposal.count.mockResolvedValue(1);
      prisma.functionalRoleAssignment.count
        .mockResolvedValueOnce(0) // not DM
        .mockResolvedValueOnce(1); // is PM
      prisma.employee.findUnique.mockResolvedValue({
        managerId: 'author-manager',
      });
      prisma.resourcingProposal.findMany.mockResolvedValue([]);

      await service.submit('um-1', 'request-1');

      expect(prisma.resourcingRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-1' },
        data: { status: 'pending_dm_review', reviewingDmId: 'author-manager' },
      });
    });
  });
});
