# No rate limiting on /auth/login or shared-link consumption (R-016)

- **Priority:** High
- **Component:** Backend / Auth
- **Severity:** Security
- **Status:** Open

## Description

`services/backend/src/modules/auth/auth.module.ts` registers exactly one
`APP_GUARD` — `JwtAuthGuard` — for authentication. There is no throttler
anywhere in the codebase: a repo-wide search for `throttl`/`rate-limit`/
`ThrottlerModule` under `services/backend/src` returns zero matches, and
`@nestjs/throttler` (or any equivalent) is not a dependency.

## Impact

`POST /api/v1/auth/login` and shared-link consumption endpoints can be hit at
unlimited request rates, permitting credential stuffing against login and
brute-force token guessing against shared links.

## Risk register reference

R-016 ("Shared-link and login endpoints have no rate limiting, permitting
token guessing or credential stuffing," score 4,
`test-design-architecture.md`) — confirmed still open in the running code by
the NFR audit, not just a theoretical risk-register entry.

## Recommended fix

Add `@nestjs/throttler` (common NestJS package, no new architecture needed),
scoped at minimum to:

- `POST /api/v1/auth/login`
- shared-link consumption route(s) in `src/modules/access/shared-link*`

## Source

- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (Security §"Other Security-relevant findings")
- [`_bmad-output/test-artifacts/test-design-architecture.md`](../../../../_bmad-output/test-artifacts/test-design-architecture.md) (R-016)
- [`src/modules/auth/auth.module.ts`](../../src/modules/auth/auth.module.ts)
