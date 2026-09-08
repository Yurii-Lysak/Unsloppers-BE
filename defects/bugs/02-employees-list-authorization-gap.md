# GET /api/v1/employees leaks builtin fields to every role (no per-row access control)

- **Priority:** Urgent
- **Component:** Backend / Directory (Employees)
- **Severity:** Security — access control gap
- **Status:** Fixed — not a product bug (owner decision 2026-09-07, option C)
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

Whoever owns the access matrix / directory list feature should make
the call on the fix shape — this needs an intentional decision (row-level
narrowing mirroring the profile endpoint), not a guess.

## Update (2026-09-07) — three-way conflict found after merging `origin/main`, not just a masking gap

Investigated further while queued behind
[test-debt 10](../test-debt/10-employees-e2e-stale-400-vs-filtershidden.md).
This is **not** simply "add the masking `updateEmployeeField` already has" —
three sources of truth disagree on what `GET /api/v1/employees` should
return for a Colleague viewer, and none of the fixes below can make all
three green simultaneously:

1. **`test/colleague-whitelist.e2e-spec.ts:240`** (`"returns S1-safe
   directory list entries"`) — expects `res.body` to be a **flat array**,
   every row exactly `{ id, displayName }`, nothing else.
2. **`test/employees.e2e-spec.ts:117`** (`"GET /api/v1/employees returns
   paginated rows for authenticated users"`, and ~40 more tests in that
   file) — the viewer is a plain `createEmployeeUser()` with **no**
   manager/PP/functional-role relationship to anyone else in the list (i.e.
   resolves as `Colleague` to every other row under `AccessResolver`), yet
   the test asserts the full paginated `{ fields, rows, total }` shape
   **with `grade` present in `fields`**. This file's whole premise is that
   any authenticated employee gets the rich table for everyone.
3. **`_bmad-output/specs/spec-people-management-platform/access-model.md`**
   §access matrix (line 96/99) — for Colleague, **S1 is `R`** and S1's
   contents explicitly include `position`, `department`, `country/city`,
   `start date`, `current project(s)` (rule 4: "colleague view is
   *exactly* S1..."), while **S4 is `—`** (no access) and S4 owns `grade`,
   `employment_type`/"Type (FTE/Subcontractor)". Applied literally, that's
   a **third, different** answer: `position`/`department`/
   `years_with_company` (derived from S1's start date) stay visible to a
   Colleague in the list, only `grade` and `employment_type` (S4 fields)
   get hidden — not a blanket collapse to `{id, displayName}`.

(1) and (2) are mutually exclusive for the same endpoint/response shape
even before consulting (3) — masking `grade`/`employment_type` per-row
(the literal access-model.md reading, option B below) would still leave
`position`/`department`/`fields` populated, which satisfies neither (1)'s
flat-array assertion nor "hides everything but id/displayName."

## Decision options

- **A. List is its own, stricter privacy boundary than S1/profile.** Keep
  (1)'s contract: a Colleague sees only `{id, displayName}` from
  `/employees`; everyone else (Self/ReportingLine/ProjectLine/PP/
  FullAccess) keeps the rich table. Requires a **viewer-level** branch (is
  this viewer's *overall* directory tier above Colleague for anyone in
  scope?), not per-row masking, since per-row would produce rows with
  different column shapes in one paginated response — awkward for a table
  UI. Would need `employees.e2e-spec.ts`'s ~40 tests re-examined: are their
  "plain employee" viewers meant to be manager-equivalent for list purposes,
  or does this file's fixture setup need a manager/functional-role grant
  added per test?
- **B. Apply access-model.md's S1-vs-S4 split literally**, per row: hide
  `grade`/`employment_type` (S4) from a Colleague's cells, keep
  `position`/`department`/`years_with_company` (S1) visible — mirrors
  `updateEmployeeField`'s existing per-row `AccessResolver` pattern, extended
  to reads. Leaves (1) failing (its assertion is stricter than the literal
  spec) — `colleague-whitelist.e2e-spec.ts` would need updating to expect
  the narrowed-but-not-empty cell set instead of `{id, displayName}`.
- **C. Reuse Story 3.4's `GET /api/v1/employees/lookup`** (already ships
  `{employeeId, name}` for every employee, auth-only, no row gating) as the
  Colleague-safe surface, and update `colleague-whitelist.e2e-spec.ts` to
  assert against `/employees/lookup` instead of `/employees` — treating the
  main list as a manager/elevated-tier-only "All Employees" feature and
  `/lookup` as the deliberately-minimal picker every employee gets. Needs
  confirmation `/lookup` is meant to double as the general colleague-safe
  directory view, not just the share-dialog picker it was built for.

Not picking one without sign-off — (A) and (C) are close cousins (viewer-
tier gating) but touch ~40 existing tests' fixtures either way; (B) is the
narrowest code change but knowingly leaves a currently-failing test
red by design pending its own update.

## Decision (2026-09-07): Option C

`GET /api/v1/employees` (the paginated directory table) stays as-is —
**intentionally not** colleague-whitelist-scoped; it's an org-wide directory
table available to any authenticated employee, matching
`employees.e2e-spec.ts`'s ~40 tests' existing assumption unchanged. No
production code change.

`GET /api/v1/employees/lookup` (Story 3.4, `EmployeeLookupEntity` —
`{employeeId, name}`, no per-row masking, auth-only) is confirmed as the
actual S1-safe surface every role, including Colleague, is meant to use for
identity-only lookups. `test/colleague-whitelist.e2e-spec.ts`'s
`"returns S1-safe directory list entries"` test now asserts against
`/employees/lookup` instead of `/employees` — see the updated test and its
inline comment for the rationale trail.

No further backend code change is planned for this item.

Verified 2026-09-08: `colleague-whitelist.e2e-spec.ts` — 34 tests in
colleague-whitelist + employee-profile-custom-fields suites pass; lookup
assertion green on branch `fix/backend-e2e-tests-fix`.

## Recommended fix (superseded by the above — kept for the original,
## simpler framing before the cross-test conflict was found)

Route `listEmployees`'s builtin-field visibility and per-row masking through
the same `AccessResolver`/`SectionAccessGate` path `updateEmployeeField`
already uses for writes.

## Source

- [`_bmad-output/test-artifacts/known-red-diagnosis.md`](../../../../_bmad-output/test-artifacts/known-red-diagnosis.md) (item 3e)
- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (Security §Authorization Controls, Release Blocker #1)
- [`src/modules/directory/employees.service.ts:169-240`](../../src/modules/directory/employees.service.ts)
