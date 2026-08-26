---
paths:
  - "test/**"
---

# E2E Testing Conventions

- Files: `test/<area>.e2e-spec.ts`; run with `npm run test:e2e` against the REAL Postgres from docker (`npm run db:up` first)
- Build the app with `createTestApp()` from `test/support/app-harness`, never `Test.createTestingModule` directly — the harness owns the bootstrap and the schema wiring
- Full detail on the harness lives in `test/README.md`

## The harness

```ts
import { createTestApp, TestApp } from './support/app-harness';

let testApp: TestApp;
beforeAll(async () => { testApp = await createTestApp(); });
afterAll(async () => { await testApp.close(); });
beforeEach(async () => { await testApp.resetDatabase(); });
```

- `testApp.server` goes to `request(...)`; `testApp.prisma` is pinned to this worker's schema
- Pass `{ clock }` to substitute a `FixedClock`; never sleep to cross a deadline
- Support code in `test/support/` has its own unit specs and runs in the unit tier

## Bootstrap config is NOT inherited

`main.ts` settings do not apply to the test app. The harness re-applies the global
`ValidationPipe`, but the prefix and versioning are still absent:

- Routes are unprefixed in e2e: request `/users`, not `/api/v1/users`

## Data isolation

- Each Jest worker owns a Postgres schema (`tea_test_w<id>`), created and migrated in `globalSetup`
- Fixed values are fine: `const email = 'user@example.com'` — the schema is private to the worker
- Do NOT prefix values with `Date.now()` and do NOT hand-delete rows in `afterAll`; `resetDatabase()` truncates

## Style

- `import request from 'supertest'` — default import (namespace import is not callable under esModuleInterop)
- Type response bodies explicitly: `const body = res.body as UserEntity`
- Cover the full flow including error codes (409 duplicate, 400 validation, 404 missing) — see `test/users.e2e-spec.ts`
- Stub external HTTP dependencies with `ExternalBoundary`, not by mocking the client class
