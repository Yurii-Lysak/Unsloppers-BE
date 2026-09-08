import { Prisma, PrismaClient } from '../../generated/prisma/client';
import {
  TimelineEventWriter,
  TimelineEventWriteContext,
} from '../../modules/contracts/timeline-event-writer.contract';

/**
 * Story 1.20 (AD-7) — Prisma Client Extension enforcing the structural
 * coupling between the four effective-dated employment-history tables and
 * the Career Timeline (C4 `TimelineEventWriter`).
 *
 * This is the ONLY legal write path to `GradeHistory`, `PositionHistory`,
 * `DepartmentHistory`, `EmploymentTypeHistory`:
 *  - `create` validates the input, checks ordering against the currently
 *    open row (if any), checks for a conflicting manual `TimelineEvent`
 *    (outside the Serializable transaction so skip metadata commits), closes
 *    the prior open row, inserts the new row, and calls C4 — the history
 *    mutations and `recordTimelineEvent` share one Serializable transaction.
 *    When the incoming `effectiveFrom` equals the open row's `effectiveFrom`
 *    (same calendar day), the write amends the open row's value in place and
 *    updates the matching system timeline event instead of appending.
 *  - Every other operation (`update`, `updateMany`, `delete`, `deleteMany`,
 *    `upsert`, `createMany`, `createManyAndReturn`, `updateManyAndReturn`,
 *    `findUnique`, `findUniqueOrThrow`) is rejected outright: history rows
 *    are append-only and closed-not-mutated, and the partial unique index
 *    only guarantees uniqueness among *open* rows, so Prisma's generated
 *    `findUnique` can silently return a stale/closed row once an employee
 *    has 2+ history rows — callers must use `findFirst`/`findMany` with an
 *    explicit `effectiveTo` filter instead.
 *
 * Known, accepted gap (spec Boundaries & Constraints -> Never): raw SQL
 * (`$queryRaw`/`$executeRaw`) issued by a CALLER against these tables is not
 * intercepted — this extension is the only interception point this story
 * guarantees.
 */

/** Model name (as Prisma reports it in `$allOperations`) -> C4 `type` string (spec 1:1 map). */
const HISTORY_MODEL_TYPE: Readonly<Record<string, string>> = {
  GradeHistory: 'grade',
  PositionHistory: 'position',
  DepartmentHistory: 'department',
  EmploymentTypeHistory: 'employmentType',
};

const HISTORY_MODEL_NAMES = Object.keys(HISTORY_MODEL_TYPE);

/**
 * Operations rejected outright on the four history models. Everything that
 * isn't `create` is rejected — history rows are append-only and
 * closed-not-mutated (bulk-mutation ops), and `findUnique`/`findUniqueOrThrow`
 * are rejected separately because the partial unique index only guarantees
 * uniqueness among *open* rows (spec Boundaries, iteration 2 renegotiation).
 */
const REJECTED_OPERATIONS = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
  'createMany',
  'createManyAndReturn',
  'updateManyAndReturn',
  'findUnique',
  'findUniqueOrThrow',
]);

/** Thrown when a history-table write's `effectiveFrom` is <= the currently open row's `effectiveFrom`. */
export class OutOfOrderEffectiveDateError extends Error {
  constructor(model: string, newEffectiveFrom: Date, openEffectiveFrom: Date) {
    super(
      `${model}: new effectiveFrom (${isoDate(newEffectiveFrom)}) must be strictly after the ` +
        `currently open row's effectiveFrom (${isoDate(openEffectiveFrom)}) — out-of-order/backdated ` +
        `writes are not supported.`,
    );
    this.name = 'OutOfOrderEffectiveDateError';
  }
}

/** Thrown for any of the four history models' rejected operations (everything except `create`). */
export class HistoryTableWriteRejectedError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} is not permitted — history rows are append-only and closed-not-mutated, ` +
        `and 'findUnique'/'findUniqueOrThrow' can return a stale/closed row. The only legal write is ` +
        `'create' (via this extension); use 'findFirst'/'findMany' with an explicit 'effectiveTo' filter ` +
        `for reads.`,
    );
    this.name = 'HistoryTableWriteRejectedError';
  }
}

/**
 * Thrown when a write is suppressed because a manual `TimelineEvent` already
 * covers this `(employeeId, type, effectiveDate)`. Deliberately a throw, not
 * a silent `null` return — a bare `null` from what looks like a
 * non-nullable `.create()` call is an NPE trap for the first real caller.
 * `manualEventId` is the id of the existing manual entry that stands.
 */
export class ManualConflictSuppressedError extends Error {
  constructor(public readonly manualEventId: string) {
    super(
      `History write suppressed — a manual TimelineEvent (id: ${manualEventId}) already covers this ` +
        `employee/type/effectiveDate. The manual entry stands; C4.markSystemWriteSkipped has been called ` +
        `on it.`,
    );
    this.name = 'ManualConflictSuppressedError';
  }
}

/**
 * Thrown when the underlying Serializable transaction loses a Postgres
 * write-conflict race (SQLSTATE `40001`, surfaced by Prisma as
 * `PrismaClientKnownRequestError` code `P2034`) — gives a caller something
 * concrete to catch/retry on instead of a raw Prisma error.
 */
export class ConcurrentHistoryWriteError extends Error {
  constructor(
    model: string,
    public readonly cause?: unknown,
  ) {
    super(
      `${model}: lost a concurrent write race (Postgres serialization failure) — retry the write against ` +
        `the now-current row.`,
    );
    this.name = 'ConcurrentHistoryWriteError';
  }
}

/** True if `error` is Prisma's surfaced form of a Postgres serialization failure (SQLSTATE 40001). */
function isSerializationFailure(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (error.code === 'P2034') {
    return true;
  }
  const meta = error.meta as
    { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
  return meta?.driverAdapterError?.cause?.originalCode === '40001';
}

/** Normalizes a Date/ISO-string input to a UTC-midnight Date (date-only precision, per AD-7). */
function toDateOnly(input: Date | string): Date {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lowerFirst(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

interface HistoryCreateData {
  employeeId: string;
  value: string;
  effectiveFrom: Date | string;
}

interface HistoryRow {
  id: string;
  employeeId: string;
  value: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
}

/** Minimal structural type for the 4 sibling history-model delegates — they are field-for-field identical. */
interface HistoryDelegate {
  findFirst(args: {
    where: { employeeId: string; effectiveTo: null };
  }): Promise<HistoryRow | null>;
  update(args: {
    where: { id: string };
    data: { effectiveTo?: Date; value?: string };
  }): Promise<HistoryRow>;
  create(args: {
    data: {
      employeeId: string;
      value: string;
      effectiveFrom: Date;
      effectiveTo: null;
    };
  }): Promise<HistoryRow>;
}

/**
 * Builds the extension. `internalClient` MUST be a client that does NOT
 * already carry this extension (in practice, the raw `PrismaService`
 * instance, pre-`$extends()`) — every write the extension performs
 * internally (closing the prior row, the insert itself, the manual-conflict
 * read) goes through it instead of the extended client passed to `query()`,
 * so those internal writes are never re-intercepted by this same extension
 * (which would otherwise reject its own `create`/`update` calls, or recurse).
 */
export function createTemporalHistoryExtension(
  timelineEventWriter: TimelineEventWriter,
  internalClient: PrismaClient,
) {
  return Prisma.defineExtension({
    name: 'temporal-history',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !HISTORY_MODEL_NAMES.includes(model)) {
            return query(args);
          }

          if (REJECTED_OPERATIONS.has(operation)) {
            throw new HistoryTableWriteRejectedError(model, operation);
          }

          if (operation !== 'create') {
            return query(args);
          }

          return handleHistoryCreate(
            internalClient,
            model,
            args as unknown as { data: HistoryCreateData },
            timelineEventWriter,
          );
        },
      },
    },
  });
}

async function handleSameDayAmend(
  client: PrismaClient,
  model: string,
  property: string,
  preOpenRow: HistoryRow,
  employeeId: string,
  value: string,
  effectiveFrom: Date,
  type: string,
  timelineEventWriter: TimelineEventWriter,
): Promise<HistoryRow> {
  if (preOpenRow.value === value) {
    return preOpenRow;
  }

  const manualConflict = await findManualConflict(client, {
    employeeId,
    type,
    effectiveFrom,
    oldValue: preOpenRow.value,
    newValue: value,
  });

  if (manualConflict) {
    await timelineEventWriter.markSystemWriteSkipped(
      manualConflict.id,
      new Date().toISOString(),
    );
    throw new ManualConflictSuppressedError(manualConflict.id);
  }

  try {
    return await client.$transaction(
      async (tx) => {
        const delegate = (tx as unknown as Record<string, HistoryDelegate>)[
          property
        ];

        const openRow = await delegate.findFirst({
          where: { employeeId, effectiveTo: null },
        });
        if (!openRow) {
          throw new Error(
            `${model}: same-day amend lost the open row — retry the write.`,
          );
        }

        const openEffectiveFrom = toDateOnly(openRow.effectiveFrom);
        if (effectiveFrom.getTime() !== openEffectiveFrom.getTime()) {
          throw new OutOfOrderEffectiveDateError(
            model,
            effectiveFrom,
            openEffectiveFrom,
          );
        }

        if (openRow.value === value) {
          return openRow;
        }

        const updated = await delegate.update({
          where: { id: openRow.id },
          data: { value },
        });

        const timelineDelegate = (
          tx as unknown as {
            timelineEvent: {
              findFirst(args: {
                where: {
                  employeeId: string;
                  type: string;
                  effectiveDate: Date;
                  source: string;
                  deletedAt: null;
                };
                orderBy: { createdAt: 'desc' };
              }): Promise<{ id: string } | null>;
              update(args: {
                where: { id: string };
                data: { newValue: string };
              }): Promise<unknown>;
            };
          }
        ).timelineEvent;

        const systemEvent = await timelineDelegate.findFirst({
          where: {
            employeeId,
            type,
            effectiveDate: effectiveFrom,
            source: 'system',
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (systemEvent) {
          await timelineDelegate.update({
            where: { id: systemEvent.id },
            data: { newValue: value },
          });
        } else {
          await timelineEventWriter.recordTimelineEvent(
            employeeId,
            type,
            isoDate(effectiveFrom),
            preOpenRow.value,
            value,
            'system',
            undefined,
            tx as unknown as TimelineEventWriteContext,
          );
        }

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isSerializationFailure(error)) {
      throw new ConcurrentHistoryWriteError(model, error);
    }
    throw error;
  }
}

async function handleHistoryCreate(
  client: PrismaClient,
  model: string,
  args: { data: HistoryCreateData },
  timelineEventWriter: TimelineEventWriter,
): Promise<HistoryRow> {
  const type = HISTORY_MODEL_TYPE[model];
  const property = lowerFirst(model);

  const employeeId = args.data.employeeId;
  const value = args.data.value;

  if (!employeeId) {
    throw new Error(
      `${model}.create requires a flat 'employeeId' scalar in 'data' — nested relation syntax ` +
        `('employee: { connect: ... }') is not supported by this extension.`,
    );
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `${model}.create requires a non-empty 'value' string in 'data'.`,
    );
  }
  if (
    args.data.effectiveFrom === undefined ||
    args.data.effectiveFrom === null
  ) {
    throw new Error(`${model}.create requires 'effectiveFrom' in 'data'.`);
  }

  const effectiveFrom = toDateOnly(args.data.effectiveFrom);
  if (Number.isNaN(effectiveFrom.getTime())) {
    throw new Error(
      `${model}.create received an unparseable 'effectiveFrom': ${String(args.data.effectiveFrom)}`,
    );
  }

  const preDelegate = (client as unknown as Record<string, HistoryDelegate>)[
    property
  ];

  // 1. Find + validate order of the currently open row (if any) —
  // BEFORE the manual-conflict check, so a backdated write that
  // happens to date-match a manual entry is correctly flagged as
  // out-of-order, not silently swallowed as a conflict suppression.
  const preOpenRow = await preDelegate.findFirst({
    where: { employeeId, effectiveTo: null },
  });

  if (preOpenRow) {
    const openEffectiveFrom = toDateOnly(preOpenRow.effectiveFrom);
    if (effectiveFrom.getTime() < openEffectiveFrom.getTime()) {
      throw new OutOfOrderEffectiveDateError(
        model,
        effectiveFrom,
        openEffectiveFrom,
      );
    }
    if (effectiveFrom.getTime() === openEffectiveFrom.getTime()) {
      return handleSameDayAmend(
        client,
        model,
        property,
        preOpenRow,
        employeeId,
        value,
        effectiveFrom,
        type,
        timelineEventWriter,
      );
    }
  }

  const incomingOldValue = preOpenRow ? preOpenRow.value : null;
  const manualConflict = await findManualConflict(client, {
    employeeId,
    type,
    effectiveFrom,
    oldValue: incomingOldValue,
    newValue: value,
  });

  if (manualConflict) {
    await timelineEventWriter.markSystemWriteSkipped(
      manualConflict.id,
      new Date().toISOString(),
    );
    throw new ManualConflictSuppressedError(manualConflict.id);
  }

  try {
    return await client.$transaction(
      async (tx) => {
        const delegate = (tx as unknown as Record<string, HistoryDelegate>)[
          property
        ];

        // Re-read under Serializable isolation for concurrent-write safety.
        const openRow = await delegate.findFirst({
          where: { employeeId, effectiveTo: null },
        });

        if (openRow) {
          const openEffectiveFrom = toDateOnly(openRow.effectiveFrom);
          if (effectiveFrom.getTime() < openEffectiveFrom.getTime()) {
            throw new OutOfOrderEffectiveDateError(
              model,
              effectiveFrom,
              openEffectiveFrom,
            );
          }
          if (effectiveFrom.getTime() === openEffectiveFrom.getTime()) {
            throw new OutOfOrderEffectiveDateError(
              model,
              effectiveFrom,
              openEffectiveFrom,
            );
          }
        }

        // 3. Close the currently open row (if any).
        if (openRow) {
          await delegate.update({
            where: { id: openRow.id },
            data: { effectiveTo: effectiveFrom },
          });
        }

        // 4. Insert the new (now-current) row. `effectiveTo` is always
        // forced to null on create — callers never set it directly; that
        // invariant is this extension's job, not the caller's.
        const created = await delegate.create({
          data: { employeeId, value, effectiveFrom, effectiveTo: null },
        });

        // 5. Structural coupling to C4 (AD-7) — same transaction: if this
        // throws, the whole transaction (close + insert) rolls back and no
        // history row is ever left without a timeline event.
        await timelineEventWriter.recordTimelineEvent(
          employeeId,
          type,
          isoDate(effectiveFrom),
          openRow ? openRow.value : null,
          value,
          'system',
          undefined,
          tx as unknown as TimelineEventWriteContext,
        );

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isSerializationFailure(error)) {
      throw new ConcurrentHistoryWriteError(model, error);
    }
    throw error;
  }
}

interface ManualConflictLookup {
  employeeId: string;
  type: string;
  effectiveFrom: Date;
  oldValue: string | null;
  newValue: string;
}

/**
 * Story 7.3 (D2 / FR-30) — resolve manual vs system conflicts.
 * 1. Exact `(employeeId, type, effectiveDate)` manual match (Story 1.20).
 * 2. Transition fallback when a system anchor exists at the incoming date
 *    and an active manual row carries the same transition values at a
 *    corrected effective date (PP date correction path).
 */
async function findManualConflict(
  client: PrismaClient,
  lookup: ManualConflictLookup,
): Promise<{ id: string } | null> {
  const { employeeId, type, effectiveFrom, oldValue, newValue } = lookup;

  const exactMatch = await client.timelineEvent.findFirst({
    where: {
      employeeId,
      type,
      effectiveDate: effectiveFrom,
      source: 'manual',
      deletedAt: null,
    },
    select: { id: true },
  });
  if (exactMatch) {
    return exactMatch;
  }

  const systemAnchor = await client.timelineEvent.findFirst({
    where: {
      employeeId,
      type,
      effectiveDate: effectiveFrom,
      source: 'system',
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!systemAnchor) {
    return null;
  }

  return client.timelineEvent.findFirst({
    where: {
      employeeId,
      type,
      source: 'manual',
      deletedAt: null,
      oldValue: jsonEqualsFilter(oldValue),
      newValue: jsonEqualsFilter(newValue),
      effectiveDate: { not: effectiveFrom },
    },
    select: { id: true },
  });
}

function jsonEqualsFilter(
  value: string | null,
): Prisma.JsonNullableFilter<'TimelineEvent'> {
  if (value === null) {
    return { equals: Prisma.DbNull };
  }
  return { equals: value };
}
