import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { RelationshipGraphGenerationService } from '../relationship-graph-generation.service';
import {
  registerRelationshipGraphBump,
  resetRelationshipGraphBumpRegistry,
  invokeRelationshipGraphBump,
} from '../../../prisma/relationship-graph-bump.registry';

describe('RelationshipGraphGenerationService', () => {
  let service: RelationshipGraphGenerationService;

  const prisma = {
    accessGraphGeneration: {
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    resetRelationshipGraphBumpRegistry();

    prisma.accessGraphGeneration.upsert.mockResolvedValue({
      generation: 5n,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationshipGraphGenerationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(RelationshipGraphGenerationService);
    await service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroyForTests();
  });

  it('loads the generation mirror from the database on init', () => {
    expect(service.getGeneration()).toBe(5n);
  });

  it('bumps generation atomically, updates the mirror, and clears the cache', async () => {
    prisma.accessGraphGeneration.upsert.mockResolvedValueOnce({
      generation: 6n,
    });
    service.setCacheEntry('k', {
      generation: 5n,
      audience: { role: 'Colleague', sections: {} as never },
      computedAt: 0,
      revalidation: {
        reportingLineMatched: false,
        assignments: [],
        peoplePartnerId: null,
        ppMatched: false,
        fullAccess: false,
      },
    });

    const next = await service.bump();

    expect(next).toBe(6n);
    expect(service.getGeneration()).toBe(6n);
    expect(service.getCacheEntry('k')).toBeUndefined();
    expect(prisma.accessGraphGeneration.upsert).toHaveBeenCalledWith({
      where: { id: 'default' },
      update: { generation: { increment: 1 } },
      create: { id: 'default', generation: 1 },
      select: { generation: true },
    });
  });

  it('clears the cache before awaiting the database upsert', async () => {
    let cacheDuringUpsert: unknown;
    prisma.accessGraphGeneration.upsert.mockImplementation(() => {
      cacheDuringUpsert = service.getCacheEntry('k');
      return Promise.resolve({ generation: 6n });
    });
    service.setCacheEntry('k', {
      generation: 5n,
      audience: { role: 'Colleague', sections: {} as never },
      computedAt: 0,
      revalidation: {
        reportingLineMatched: false,
        assignments: [],
        peoplePartnerId: null,
        ppMatched: false,
        fullAccess: false,
      },
    });

    await service.bump();

    expect(cacheDuringUpsert).toBeUndefined();
  });

  it('leaves no stale cache entries after parallel bumps', async () => {
    prisma.accessGraphGeneration.upsert
      .mockResolvedValueOnce({ generation: 6n })
      .mockResolvedValueOnce({ generation: 7n });
    service.setCacheEntry('k', {
      generation: 5n,
      audience: { role: 'Colleague', sections: {} as never },
      computedAt: 0,
      revalidation: {
        reportingLineMatched: false,
        assignments: [],
        peoplePartnerId: null,
        ppMatched: false,
        fullAccess: false,
      },
    });

    await Promise.all([service.bump(), service.bump()]);

    expect(service.getCacheEntry('k')).toBeUndefined();
    expect(service.getGeneration()).toBe(7n);
  });

  it('registers bump with the Prisma extension registry on init', () => {
    resetRelationshipGraphBumpRegistry();
    const localBump = jest.fn();
    registerRelationshipGraphBump(localBump);

    return invokeRelationshipGraphBump().then(() => {
      expect(localBump).toHaveBeenCalledTimes(1);
    });
  });
});
