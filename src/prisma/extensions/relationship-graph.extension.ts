import { Prisma } from '../../generated/prisma/client';
import { invokeRelationshipGraphBump } from '../relationship-graph-bump.registry';

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

function employeeDataTouchesGraph(data: unknown): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const record = data as Record<string, unknown>;
  return 'managerId' in record || 'peoplePartnerId' in record;
}

function argsTouchEmployeeGraph(args: {
  data?: unknown;
  create?: unknown;
  update?: unknown;
}): boolean {
  if (employeeDataTouchesGraph(args.data)) {
    return true;
  }
  if (employeeDataTouchesGraph(args.create)) {
    return true;
  }
  if (employeeDataTouchesGraph(args.update)) {
    return true;
  }
  return false;
}

/** Exported for integration tests — mirrors the extension middleware path. */
export async function runWithBump<T>(
  operation: string,
  query: (args: unknown) => Promise<T>,
  args: unknown,
  shouldBump: boolean,
): Promise<T> {
  const result = await query(args);
  if (shouldBump && WRITE_OPERATIONS.has(operation)) {
    await invokeRelationshipGraphBump();
  }
  return result;
}

export function employeeWriteTouchesGraph(
  operation: string,
  args: { data?: unknown; create?: unknown; update?: unknown },
): boolean {
  return WRITE_OPERATIONS.has(operation) && argsTouchEmployeeGraph(args);
}

export function projectAssignmentWriteTouchesGraph(operation: string): boolean {
  return WRITE_OPERATIONS.has(operation);
}

export function departmentHistoryWriteTouchesGraph(operation: string): boolean {
  return operation === 'create';
}

export function fullAccessGrantWriteTouchesGraph(operation: string): boolean {
  return WRITE_OPERATIONS.has(operation);
}

/**
 * Story 1.13 (AD-4/D1) — bumps the relationship-graph generation counter
 * after writes that affect access resolution.
 *
 * C12 hook point: when the `Department` entity lands, add a `department`
 * model handler here using the same `runWithBump` path — do not invent a
 * second invalidation mechanism.
 */
export function createRelationshipGraphExtension() {
  return Prisma.defineExtension({
    name: 'relationshipGraph',
    query: {
      employee: {
        async $allOperations({ operation, args, query }) {
          const shouldBump = employeeWriteTouchesGraph(
            operation,
            args as { data?: unknown; create?: unknown; update?: unknown },
          );
          return runWithBump(operation, query, args, shouldBump);
        },
      },
      projectAssignment: {
        async $allOperations({ operation, args, query }) {
          return runWithBump(
            operation,
            query,
            args,
            projectAssignmentWriteTouchesGraph(operation),
          );
        },
      },
      departmentHistory: {
        async $allOperations({ operation, args, query }) {
          return runWithBump(
            operation,
            query,
            args,
            departmentHistoryWriteTouchesGraph(operation),
          );
        },
      },
      fullAccessGrant: {
        async $allOperations({ operation, args, query }) {
          return runWithBump(
            operation,
            query,
            args,
            fullAccessGrantWriteTouchesGraph(operation),
          );
        },
      },
    },
  });
}
