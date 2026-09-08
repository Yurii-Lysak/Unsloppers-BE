# Decision needed: filtering on a hidden field should 400 or degrade with `filtersHidden`?

- **Priority:** High
- **Type:** Needs Owner Decision
- **Component:** Backend / Directory (Employees)
- **Status:** Open

## Description

`test/employees.e2e-spec.ts:390` — `"rejects filters on management custom
fields for colleague viewers"` — expects `400` when a Colleague-role viewer
filters `GET /api/v1/employees` on a `visibility: 'management'` custom
field. It now gets `200`.

This surfaced only after merging `origin/main` into `docs/defect-tracking`
(4 commits: Story 3.4 "saved and shared views", Story 10.3, PR #45, CI
pipeline) **and** applying the fix for
[bug 03](../bugs/03-employees-filters-400-dto-defect.md) in the same branch.
Neither change alone reproduces it:

- Before the bug 03 fix, `filters` was universally broken (whitelist
  stripped `fieldId`/`value`), so this test passed with a `400` — but for
  the wrong reason (`Unknown field "undefined"`, not the visibility check
  the test name describes).
- `main` doesn't have the bug 03 DTO fix yet, so the same false-positive
  masking is presumably still hiding this on `main` too.

## Root cause: two contracts now disagree

Story 3.4 added `EmployeesService.resolveEffectiveFilters()`
(`src/modules/directory/employees.service.ts:114`, doc comment ~101-112):
when a filter references a field outside the viewer's visibility, it
**silently drops the entire filter set** and returns `filtersHidden: true`
(new field on `EmployeeListEntity`, `src/modules/directory/entities/
employee-list.entity.ts:44`) instead of throwing — explicitly so a shared
saved view filtering on a management-only field doesn't 400 for a viewer
who's only entitled to their own slice.

`field-registry.service.ts`'s `validateFilters` (line 607) still throws
`400 Field "..." is not filterable for this viewer` for the exact same
scenario — but `resolveEffectiveFilters` now intercepts and strips the
filter before it ever reaches `queryEmployees`/`validateFilters`, so that
400 path is effectively dead for this case.

`test/employees.e2e-spec.ts:390` was written against the old (400) contract
and was never updated when Story 3.4 shipped the new (graceful-degrade)
one.

## Decision options

1. **Update the stale test** to match the shipped Story 3.4 contract:
   assert `200` with `filtersHidden: true` and an unfiltered/full row set,
   consistent with `saved-views.e2e-spec.ts`'s coverage of the same
   mechanism.
2. **Revert to 400** for direct `/employees` calls (not via a shared/saved
   view) and reserve the graceful-degrade behavior for the saved-view
   fetch path only — would need `resolveEffectiveFilters` to know whether
   the request came through a saved view.

Option 1 matches the already-shipped, already-tested design and touches
only test code; option 2 is a product/behavior change on top of merged
work. Leaning towards (1), but not changing test assertions without
sign-off since it encodes a real access-control decision.

## Also observed in the same run (separate, likely unrelated)

`"returns page 2 when pageSize is 50 and more than 50 employees exist"`
timed out at 30s when run alongside `campaigns.e2e-spec.ts` +
`saved-views.e2e-spec.ts` (passed in isolation earlier). Consistent with
[bug 05](../bugs/05-employees-query-full-table-load.md) (no DB-side
pagination) rather than anything from this merge — flagged here for
awareness, not claiming root cause.

## Source

- Discovered fixing [bug 03](../bugs/03-employees-filters-400-dto-defect.md)
  on `docs/defect-tracking` immediately after merging `origin/main`.
