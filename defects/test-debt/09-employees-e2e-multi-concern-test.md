# One employees.e2e-spec.ts test bundles a manager's edit workflow AND a colleague's denial

- **Priority:** Normal
- **Type:** Test Debt
- **Component:** Backend / Test Suite (Employees)
- **Status:** Open

## Description

`test/employees.e2e-spec.ts:433-547`
(`'allows a manager to inline-edit a direct report grade and rejects a
colleague'`) asserts, in sequence: (1) a manager's `writableFieldIds`
includes `grade`, (2) a first grade edit persists, (3) a second grade edit on
top of the first also persists, (4) two `gradeHistory` rows exist afterward
with correct `effectiveTo`/`value`, and (5) a colleague performing the same
PATCH is rejected with 403.

## Why this matters

(1)-(4) and (5) are at least two genuinely unrelated concerns (a manager's
successful multi-step edit workflow vs. a different actor's authorization
denial) sharing one `it`. A failure in the colleague-denial assertion at the
bottom reports as a failure of "allows a manager to inline-edit a direct
report grade," which doesn't localize the actual regression.

## Recommended fix

Split by concern, matching the pattern the rest of the file's
colleague-denial tests already follow elsewhere:

```typescript
it('lets a manager inline-edit a direct report grade, appending a new history row', async () => { /* concerns 1-4 */ });
it("rejects a colleague inline-editing another employee's grade", async () => { /* concern 5 */ });
```

## Priority note

Low urgency — the test is correct today, this is a readability/
diagnosability improvement, not a correctness risk.

## Source

- [`_bmad-output/test-artifacts/test-review.md`](../../../../_bmad-output/test-artifacts/test-review.md) (Recommendation 5, Row M3)
- [`test/employees.e2e-spec.ts:433-547`](../../test/employees.e2e-spec.ts)
