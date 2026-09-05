# GET /api/v1/employees leaks builtin fields to every role (no per-row access control)

- **Priority:** Urgent
- **Component:** Backend / Directory (Employees)
- **Severity:** Security — access control gap
- **Status:** Open
- **ClickUp:** Filed

## Description

`GET /api/v1/employees` returns full builtin-field data (grade, position,
department, employment_type, years_with_company) for **every** employee to
**any** authenticated caller who has an Employee record — including a plain
Colleague viewer who should only see the S1-safe subset (`id`, `displayName`).

## Root cause

- `filterVisibleFields` (`employees.service.ts` ~line 169) only filters
  **custom** fields by visibility — every builtin field is pushed through
  unconditionally for every viewer (line 182:
  `if (field.source !== 'custom') { visible.push(field); continue; }`).
- `maskRowCells` (~line 202) only masks **custom** field cells per row; it
  never touches builtin cells.
- Nothing in `listEmployees` calls `SectionAccessGate`/`AccessResolver` per
  row, unlike `updateEmployeeField`, which does gate `S16` writes and does
  check `audience.sections.S4` for builtin writes a few methods below.

## Steps to reproduce

1. Authenticate as a Colleague-role viewer (no elevated relationship to the
   target employees).
2. Call `GET /api/v1/employees`.
3. Observe the response includes `grade`, `department`, `position`,
   `years_with_company` etc. for employees the viewer has no elevated access
   to.

## Expected vs actual

- **Expected:** per the S1 access rule, a Colleague viewer should only
  receive `{ id, displayName }` — the same row-level narrowing the employee
  profile endpoint already applies.
- **Actual:** full builtin-field row returned regardless of role.

## Already covered by a failing test

`test/colleague-whitelist.e2e-spec.ts` → `"returns S1-safe directory list
entries"` (line ~241) already fails against this exact behavior. No new test
needed — this test going green is the Definition of Done.

## Note

Whoever owns the access matrix / directory list feature (AD-14) should make
the call on the fix shape — this needs an intentional decision (row-level
narrowing mirroring the profile endpoint), not a guess.

## Recommended fix

Route `listEmployees`'s builtin-field visibility and per-row masking through
the same `AccessResolver`/`SectionAccessGate` path `updateEmployeeField`
already uses for writes.

## Source

- [`_bmad-output/test-artifacts/known-red-diagnosis.md`](../../../../_bmad-output/test-artifacts/known-red-diagnosis.md) (item 3e)
- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (Security §Authorization Controls, Release Blocker #1)
- [`src/modules/directory/employees.service.ts:169-240`](../../src/modules/directory/employees.service.ts)
