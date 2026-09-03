/**
 * Breaks the PrismaModule ↔ RelationshipGraphGenerationService circular
 * dependency: the Prisma client extension calls this registry; the service
 * registers `bump()` on module init.
 */
let bumpImpl: (() => Promise<void>) | null = null;

export function registerRelationshipGraphBump(fn: () => Promise<void>): void {
  bumpImpl = fn;
}

export async function invokeRelationshipGraphBump(): Promise<void> {
  if (bumpImpl) {
    await bumpImpl();
  }
}

/** Test-only reset. */
export function resetRelationshipGraphBumpRegistry(): void {
  bumpImpl = null;
}
