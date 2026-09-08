# S16 custom-field visibility test can execute zero assertions and still pass

- **Priority:** High
- **Type:** Test Debt
- **Component:** Backend / Test Suite (Access Matrix)
- **Status:** Open

## Description

In `test/matrix-flag-gated.e2e-spec.ts:282-285`, the test `'hides
management-only S16 fields from Colleague viewers'` puts **every** assertion
inside a single guard with no fallback:

```typescript
if (s16 && 'data' in s16) {
  expect(s16.data?.values ?? {}).not.toHaveProperty(managementField.id);
  expect(s16.data?.values?.[colleagueField.id]).toBe('public');
}
```

Unlike `04-matrix-flag-gated-s7-guarded-assertion.md`, this test has **no
secondary unconditional assertion** anywhere else in its body. If `s16` is
ever `undefined` or lacks `'data'` (e.g. an `unavailable` status under a
provider hiccup — a shape already seen elsewhere in `risks.e2e-spec.ts` and
`management-notes.e2e-spec.ts`), this test executes **zero assertions** and
Jest still reports it as passed — "a test that can pass while the behavior is
broken."

## Why this matters

S16 is explicitly named in `test-design-qa.md` as R-009 ("custom-field
existence inferable") and P0-008 — one of the P0 rows. This is also the same
section flagged in `known-red-diagnosis.md` §3a for a *different*
fragile-assertion defect — S16 now has the most assertion-fragility findings
in the whole suite.

## Recommended fix

```typescript
expect(res.body.sections).toHaveProperty('S16');
expect(s16.data?.values ?? {}).not.toHaveProperty(managementField.id);
expect(s16.data?.values?.[colleagueField.id]).toBe('public');
```

## Source

- [`_bmad-output/test-artifacts/test-review.md`](../../../../_bmad-output/test-artifacts/test-review.md) (Recommendation 2, Row H3)
- [`test/matrix-flag-gated.e2e-spec.ts:282-285`](../../test/matrix-flag-gated.e2e-spec.ts)
