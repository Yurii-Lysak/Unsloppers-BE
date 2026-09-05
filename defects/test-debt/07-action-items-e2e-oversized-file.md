# action-items.e2e-spec.ts is ~1,633 lines — over 1.6x the maintainability ceiling

- **Priority:** High
- **Type:** Test Debt
- **Component:** Backend / Test Suite (Action Items)
- **Status:** Open

## Description

`test/action-items.e2e-spec.ts` is approximately 1,633 lines — well past the
1,000-line ceiling the suite's own convention sets (`test-quality.md`). It
mixes four largely-independent concerns in one file:

1. CRUD lifecycle
2. Overdue derivation
3. Campaign bulk-activation
4. Provider-failure handling

## Why this matters

Each concern would read better, fail more locally, and be easier to navigate
as its own file. A single 1,633-line file makes it hard to find the relevant
test when only one concern regresses, and increases the odds of accidental
cross-contamination between unrelated setup blocks.

## Recommended fix

Split into focused files, e.g.:

- `action-items-crud.e2e-spec.ts`
- `action-items-overdue.e2e-spec.ts`
- `action-items-campaign-activation.e2e-spec.ts`
- `action-items-provider-failure.e2e-spec.ts`

## Priority note

This is a readability/maintainability cost, not a correctness risk — the
tests inside are not reported as flaky or wrong.

## Source

- [`_bmad-output/test-artifacts/test-review.md`](../../../../_bmad-output/test-artifacts/test-review.md) (Row H5)
- [`test/action-items.e2e-spec.ts`](../../test/action-items.e2e-spec.ts)
