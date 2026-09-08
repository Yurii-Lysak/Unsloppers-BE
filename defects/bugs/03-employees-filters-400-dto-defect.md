# Employee list `filters` query param 400s — fieldId stripped during DTO transformation

- **Priority:** High
- **Component:** Backend / Directory (Employees)
- **Severity:** Functional defect
- **Status:** Fixed
- **ClickUp:** Filed

## Description

`GET /api/v1/employees?filters=...` (JSON-encoded filter array) returns `400`
instead of applying the filter. A request with no `filters` param returns
`200` normally — the bug is specific to the filters path.

## Actual response body

```json
{"message":"Unknown field \"undefined\"","error":"Bad Request","statusCode":400}
```

Thrown at `field-registry.service.ts:615` (validateFilters) — validation
passes, but `filter.fieldId` arrives as `undefined`; the nested filter
objects lose their properties during DTO transformation.

## Likely cause

`dto/list-employees-query.dto.ts` (~lines 83-105) combines `@Transform`
(`JSON.parse`), `@Type(() => EmployeeFieldFilterDto)` and
`@ValidateNested({ each: true })` on the same property, under the global
`ValidationPipe({ whitelist: true, transform: true })`
(`src/bootstrap.ts:21`). When `@Transform` supplies the parsed value, the
array items are apparently not instantiated as `EmployeeFieldFilterDto`
instances, and `whitelist` then strips properties it has no class metadata
for.

## Steps to reproduce

```
GET /api/v1/employees?filters=[{"fieldId":"years_with_company","operator":"gt","value":3}]
```

Observe `400 Unknown field "undefined"` instead of a filtered result set.

## Already covered by failing tests

`test/employees.e2e-spec.ts` →
`"filters employees by derived years_with_company > 3"` and
`"returns an empty row set when filters match no employees"` — both already
fail against this. No new test needed.

## Note for investigation

None of the three implicated pieces (DTO, ValidationPipe, `validateFilters`)
changed recently — worth confirming whether this is a long-standing bug
nothing exercised until now, or an environment difference.

## Resolution

Fixed in `85ccfa9` ([Unsloppers-BE#47](https://github.com/Yurii-Lysak/Unsloppers-BE/pull/47)):
`list-employees-query.dto.ts` now calls `plainToInstance(EmployeeFieldFilterDto, parsed)`
inside the `@Transform` so `ValidationPipe` whitelist retains `fieldId`, `operator`,
and `value`. Verified 2026-09-08: both filter e2e cases in `employees.e2e-spec.ts`
pass on branch `fix/backend-e2e-tests-fix` @ `3fd8934`.

## Source

- [`_bmad-output/test-artifacts/known-red-diagnosis.md`](../../../../_bmad-output/test-artifacts/known-red-diagnosis.md) (item 3d)
- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (High Priority #4)
- [`src/modules/directory/dto/list-employees-query.dto.ts:83-105`](../../src/modules/directory/dto/list-employees-query.dto.ts)
