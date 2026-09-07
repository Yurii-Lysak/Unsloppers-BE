# Decision needed: should custom-fields/users routes require an Employee record?

- **Priority:** High
- **Type:** Needs Owner Decision
- **Component:** Backend / Access Control
- **Status:** Open

## Description

Three e2e tests currently fail with `403` where they expect success:

- `custom-fields.e2e-spec.ts:23` — `GET /api/v1/custom-fields`, expected 200, got 403
- `custom-fields.e2e-spec.ts:41` — `GET /api/v1/custom-fields/values/:id`, expected 404, got 403
- `auth.e2e-spec.ts:89` — `GET /api/v1/users`, expected 200, got 403

All three authenticate through `loginAsOperator` (`test/support/login.ts`),
which creates a bare `User` with **no `Employee` row**.
`CustomFieldsController.resolveViewerEmployeeId` (line 118) throws
`ForbiddenException('Authenticated user has no employee record')` — traced to
commit `5501c98`, "enforce colleague whitelist on all API routes (Story
1.8)", which added viewer-employee resolution to both the custom-fields and
users controllers.

## Why this needs a decision, not just a fix

This looks like **intended hardening with stale fixtures** — the access-leak
harness (`access-matrix-leaks.e2e-spec.ts:160`) explicitly asserts this exact
403 for a user with no employee record, so the behavior may be correct by
design. But the *failing* test's own name says "returns an array for
authenticated users" for the custom-fields **definition list** route — which
suggests the intended contract for listing field *definitions* (vs. field
*values*) might be meant to work for any authenticated user, employee record
or not.

## Decision options

1. Harden `loginAsOperator`/the test fixtures to always create an Employee
   record — confirms the current behavior is correct as-is.
2. Exempt the definition-list route (`GET /api/v1/custom-fields`) from the
   Employee-record requirement, since listing *definitions* (not values) may
   not need a resolvable viewer identity.

## Owner

Whoever owns the access-matrix/Story 1.8 scope should make this call — not
something to guess from test behavior alone.

## Source

- [`_bmad-output/test-artifacts/known-red-diagnosis.md`](../../../../_bmad-output/test-artifacts/known-red-diagnosis.md) (item 3c)
