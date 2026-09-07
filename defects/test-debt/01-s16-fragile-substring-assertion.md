# Fragile substring assertion falsely reads as a security leak (S16)

- **Priority:** Normal
- **Type:** Test Debt
- **Component:** Backend / Test Suite (Custom Fields)
- **Status:** Open

## Description

`test/employee-profile-custom-fields.e2e-spec.ts:194` asserts:

```typescript
expect(colleagueRaw).not.toContain('L');
```

`'L'` was meant to guard against the leaked *value* of the employee-only
"Shirt size" field. But it's a single common character, and the Colleague
response legitimately contains the key `manageLeaveUrl` (from the S10
section), which contains a capital `L`. The assertion trips on this unrelated
key, not on an actual leak.

## Verification that this is a false alarm

The structured assertions immediately above (lines 184-189) already pass and
correctly confirm the Colleague viewer receives exactly the
colleague-visibility field (`Nickname`/`Sam`) and neither the management
field (`at-risk`) nor the employee-only field name (`Shirt size`). Access
control is correct; only the raw substring guard is wrong.

## Recommended fix

Replace the substring scan with either a structured assertion (assert the
exact key set / `not.toHaveProperty`), or if a raw-text guard is still
wanted, use a value that isn't a single common character.

## Source

- [`_bmad-output/test-artifacts/known-red-diagnosis.md`](../../../../_bmad-output/test-artifacts/known-red-diagnosis.md) (item 3a)
- [`test/employee-profile-custom-fields.e2e-spec.ts:194`](../../test/employee-profile-custom-fields.e2e-spec.ts)
