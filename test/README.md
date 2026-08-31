# Backend Test Suite

Two tiers, two Jest configs.

| Tier | Config                | Files                                   | Needs Postgres |
| ---- | --------------------- | --------------------------------------- | -------------- |
| Unit | `package.json` `jest` | `src/**/__tests__/*.spec.ts`, `test/support/*.spec.ts` | no  |
| E2E  | `test/jest-e2e.json`  | `test/*.e2e-spec.ts`                    | yes            |

```bash
npm test                  # unit, no database
npm run test:e2e          # e2e, parallel workers
npm run test:e2e:serial   # e2e, one worker, for debugging
npm run db:up             # start Postgres first
```

Node 22 is required (`.nvmrc`): Prisma 7 refuses to install on anything below
20.19 or 22.12.

Support code in `test/support/` is shared by both tiers. Its own `*.spec.ts`
files run in the unit tier, because the harness is worth testing before anything
is built on it.

## Per-worker database isolation

Jest spreads test files across workers, and they all talk to one Postgres.
Sharing a schema means one file can read or delete rows another file is using —
a failure that appears at random, and on an access-control suite can just as
easily *pass* for the wrong reason.

Each worker therefore gets its own schema:

- `jest-e2e.global-setup.ts` drops and recreates `tea_test_w1..N` — one per
  worker Jest will spawn — and applies the migrations to each. It provisions
  through the Prisma CLI rather than the client, because `globalSetup` runs
  outside the module registry that resolves the generated client.
- `createTestApp()` overrides `PrismaService` with a client pinned to this
  worker's schema via the adapter's `schema` option.
- `jest-e2e.global-teardown.ts` drops them again.

Two guards protect this. Only schemas prefixed `tea_test_w` can be dropped or
truncated, and provisioning refuses to run against a non-local host unless
`TEA_ALLOW_REMOTE_TEST_DB=1` says otherwise.

Environment variables:

| Variable                   | Effect                                            |
| -------------------------- | ------------------------------------------------- |
| `TEA_KEEP_TEST_SCHEMAS=1`  | skip teardown, to inspect what a failure left     |
| `TEA_TEST_SCHEMA_PREFIX`   | rename the schemas, default `tea_test`            |
| `TEA_ALLOW_REMOTE_TEST_DB=1` | allow a non-local `DATABASE_URL`                |

## Writing an e2e test

```ts
import request from 'supertest';
import { createTestApp, TestApp } from './support/app-harness';

describe('something (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  it('does the thing', () => {
    return request(testApp.server).get('/api/v1/health').expect(200);
  });
});
```

`createTestApp` calls `configureApp` (the same bootstrap as `main.ts`): `/api`
prefix, `/v1` versioning, cookies, CORS, Swagger. Request `/api/v1/users`, not
`/users`. Protected routes need a session — see `test/support/login.ts`.

Fixed values like `user@example.com` are fine — the schema belongs to this
worker. The old convention of prefixing every value with `Date.now()` is no
longer needed.

## Time

`Clock` (`src/clock/clock.service.ts`) is the only source of "now" in
application code. Tests pass a `FixedClock` and move time deliberately:

```ts
const clock = new FixedClock('2026-01-05T09:00:00.000Z');
const testApp = await createTestApp({ clock });

clock.advance(8 * DAY);
```

Nothing in a test should ever sleep to cross a deadline.

## External boundaries

`ExternalBoundary` is a real HTTP server on loopback that the test controls, for
the dependencies this system does not own — the timetracker APIs and the
PeopleForce import. It exercises the client's actual HTTP path, including its
timeout handling:

```ts
const boundary = await ExternalBoundary.start('timetracker-leaves');
boundary.behave({ kind: 'respond', status: 503 });
// ... point the client's base URL at boundary.url
await boundary.goOffline();   // connection refused, not a slow response
await boundary.stop();
```

Behaviours are `respond`, `malformed`, `hang` (never answers, so the client's
timeout decides) and `reset` (peer reset mid-request). It models no provider's
payloads on purpose; the response shape belongs to that client's own tests.

## Access matrix

`support/access-matrix.ts` is the machine-readable form of the section access
matrix in `_bmad-output/specs/spec-people-management-platform/access-model.md`.
Its types make a missing section or audience a compile error, and
`assertMatrixCoverage()` makes an untested pair a test failure — a new section
that silently defaults to allowed is the failure mode it exists to prevent.

`support/access-matrix.spec.ts` already enforces two spec rules over the data
itself: the colleague view is a whitelist, and no shared link is ever writable.

**When `access-model.md` changes, change `access-matrix.ts` in the same commit.**

## Relationship graphs

`support/graph-factory.ts` builds the reporting, project, and people-partner
graph every access case is a function of, and computes the expected audience
from the spec rules independently of the resolver under test:

```ts
const graph = aGraph()
  .reportsTo('ic', 'unitManager')
  .project('atlas', { pm: 'pm', dm: 'dm' })
  .assign('ic', 'atlas')
  .peoplePartner('ic', 'pp')
  .build();

graph.audienceFor('dm', 'ic'); // 'managerLine'
```

It is in-memory only for now. `prisma/schema.prisma` still holds just the
starter `User` model, so there is nothing to persist into; the `TODO` in that
file marks where `persist(prisma)` attaches once the domain models land.
