# Guarded assertion can silently skip the S7 check it exists to make

- **Priority:** High
- **Type:** Test Debt
- **Component:** Backend / Test Suite (Access Matrix)
- **Status:** Open

## Description

In `test/matrix-flag-gated.e2e-spec.ts:89-91`, the test `'hides unflagged S7
notes from Self on profile and parallel route'` wraps its profile-side
assertion in a runtime guard with no `else` and no later unconditional check
on the same data:

```typescript
const s7 = (profileRes.body as { sections?: { S7?: { data?: { notes?: unknown[] } } } }).sections?.S7;
if (s7 && 'data' in s7) {
  expect(s7.data?.notes ?? []).toHaveLength(0);
}
```

If `S7` is ever absent from the profile response for `Self` (e.g. a future
regression removes the section, or the provider starts returning an
`unavailable` status under some condition), `s7 && 'data' in s7` evaluates to
`false`, the block is skipped, and the test reports **green having verified
nothing** about the profile surface — exactly the surface this test's name
claims to cover.

## Why this matters

This sits in the suite's highest-risk area — the zero-leak access matrix
(`test-design-qa.md` scores "leak through a non-profile surface" and "suites
drift from the matrix" at 9 and 6, R-001/R-007). A conditional assertion here
is worse than a wrong expected value: a wrong value fails loudly and gets
fixed, a skipped assertion passes silently.

## Recommended fix

```typescript
expect(profileRes.body.sections).toHaveProperty('S7');
expect(s7).toMatchObject({ data: { notes: [] } });
```

## Related

Same pattern recurs in `05-matrix-flag-gated-s16-guarded-assertion-only.md`
(S16) — worse there, since it's the test's *only* assertion.

## Source

- [`_bmad-output/test-artifacts/test-review.md`](../../../../_bmad-output/test-artifacts/test-review.md) (Recommendation 1, Row H3)
- [`test/matrix-flag-gated.e2e-spec.ts:89-91`](../../test/matrix-flag-gated.e2e-spec.ts)
