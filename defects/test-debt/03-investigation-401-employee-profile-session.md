# Session unexpectedly invalidated mid-suite in employee-profile.e2e-spec.ts (not root-caused)

- **Priority:** Normal
- **Type:** Needs Investigation
- **Component:** Backend / Auth or Test Suite (unclear which — that's the open question)
- **Status:** Fixed

## Description

`test/employee-profile.e2e-spec.ts` failed at the last three tests — each with
a `401` on the **first** request using the shared `colleagueAgent`, before any
mutation in those tests.

## Root cause (confirmed 2026-09-08)

Not JWT expiry or `FixedClock` (this suite does not inject a clock). The
`"still returns S1 data when mentor lookup fails"` test creates a second
`createTestApp()` mid-suite. `createTestApp` defaults to `truncate: true`, which
wipes the worker's shared Postgres schema. That deletes all users while the
`colleagueAgent` cookie still holds a valid JWT — `JwtStrategy` then rejects
the request because `payload.sub` no longer exists (`401`).

## Fix

- Pass `truncate: false` on the nested `createTestApp`.
- Seed the nested app with `emailSuffix: '-mentor-fail'` (and matching
  `profileEmail`) so fixture emails do not collide in the shared schema.

Verified: full `employee-profile.e2e-spec.ts` — 18/18 pass on branch
`fix/backend-e2e-tests-fix`.

## Source

- [`_bmad-output/test-artifacts/known-red-diagnosis.md`](../../../../_bmad-output/test-artifacts/known-red-diagnosis.md) (item 3f)
- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (Evidence Gaps — "Session-invalidation root cause")
