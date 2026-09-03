import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResolvedAudience } from '../contracts/access-resolver.contract';
import { ProjectAssignmentDto } from '../contracts/project-assignment.contract';
import {
  registerRelationshipGraphBump,
  resetRelationshipGraphBumpRegistry,
} from '../../prisma/relationship-graph-bump.registry';

export interface AccessResolutionCacheEntry {
  generation: bigint;
  audience: ResolvedAudience;
  computedAt: number;
  revalidation: {
    reportingLineMatched: boolean;
    assignments: ProjectAssignmentDto[];
    peoplePartnerId: string | null;
    ppMatched: boolean;
    fullAccess: boolean;
  };
}

const DEFAULT_GENERATION_ROW_ID = 'default';

@Injectable()
export class RelationshipGraphGenerationService implements OnModuleInit {
  private currentGeneration = 0n;
  private readonly cache = new Map<string, AccessResolutionCacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    registerRelationshipGraphBump(async () => {
      await this.bump();
    });
    await this.loadGeneration();
  }

  /** Test-only teardown. */
  onModuleDestroyForTests(): void {
    resetRelationshipGraphBumpRegistry();
    this.cache.clear();
  }

  async loadGeneration(): Promise<void> {
    const row = await this.prisma.accessGraphGeneration.upsert({
      where: { id: DEFAULT_GENERATION_ROW_ID },
      update: {},
      create: { id: DEFAULT_GENERATION_ROW_ID, generation: 0 },
      select: { generation: true },
    });
    this.currentGeneration = row.generation;
  }

  getGeneration(): bigint {
    return this.currentGeneration;
  }

  async bump(): Promise<bigint> {
    // Clear before the DB round-trip so no concurrent resolveAudience can
    // serve a stale entry at the pre-bump generation while upsert awaits.
    this.cache.clear();
    const row = await this.prisma.accessGraphGeneration.upsert({
      where: { id: DEFAULT_GENERATION_ROW_ID },
      update: { generation: { increment: 1 } },
      create: { id: DEFAULT_GENERATION_ROW_ID, generation: 1 },
      select: { generation: true },
    });
    this.currentGeneration = row.generation;
    return this.currentGeneration;
  }

  getCacheEntry(key: string): AccessResolutionCacheEntry | undefined {
    return this.cache.get(key);
  }

  setCacheEntry(key: string, entry: AccessResolutionCacheEntry): void {
    this.cache.set(key, entry);
  }

  deleteCacheEntry(key: string): void {
    this.cache.delete(key);
  }

  clearCache(): void {
    this.cache.clear();
  }

  cacheKey(viewerId: string, subjectId: string): string {
    return `${viewerId}:${subjectId}`;
  }
}
