# Decision needed: should custom-fields/users routes require an Employee record?

- **Priority:** High
- **Type:** Needs Owner Decision
- **Component:** Backend / Access Control
- **Status:** Fixed

## Description

Three e2e tests failed with `403` where they expected success because
`loginAsOperator` created a bare `User` with **no `Employee` row**, while
Story 1.8 requires a resolvable viewer employee on protected routes.

## Decision (option 1 — 2026-09-08)

**Keep product behavior.** Authenticated users without an employee record
correctly receive `403` on custom-fields and user-list routes (see
`colleague-whitelist.e2e-spec.ts:304-310` and access-matrix leak harness).
Align fixtures instead of exempting routes.

## Fix

- `test/support/login.ts` — `loginAsOperator` now creates `employee: { create: {} }`.
- `test/auth.e2e-spec.ts` — `GET /api/v1/users` expects `403` for user without
  employee; session test asserts self read via `GET /api/v1/users/:id` instead.

Verified: `custom-fields.e2e-spec`, `auth.e2e-spec`, and `users.e2e-spec` pass
on branch `fix/backend-e2e-tests-fix`.

## Source

- [`_bmad-output/test-artifacts/known-red-diagnosis.md`](../../../../_bmad-output/test-artifacts/known-red-diagnosis.md) (item 3c)
