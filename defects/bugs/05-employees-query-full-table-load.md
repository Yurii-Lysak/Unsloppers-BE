# queryEmployees loads the full employee table into memory — no DB-level pagination

- **Priority:** High
- **Component:** Backend / Directory (Employees)
- **Severity:** Performance / Scalability
- **Status:** Open

## Description

`FieldRegistryService.queryEmployees` (`field-registry.service.ts:467-563`)
calls `this.loadEmployeeSnapshots()` (line 512), a private method
(`field-registry.service.ts:635+`) whose body is:

```typescript
private async loadEmployeeSnapshots(): Promise<EmployeeSnapshot[]> {
  const employees = await this.prisma.employee.findMany({
    include: { user: { select: { name: true } } /* + history tables */ },
  });
  // ... builds one snapshot per employee, joining 4 history tables each
}
```

There is **no `where`, no `take`/`skip`, no `LIMIT`/`OFFSET`** — every
employee row (with all its joined history tables) is fetched on every list
request, regardless of filters or requested page. Filtering (`applyFilters`,
line 525) and sorting (`sortSnapshots`, lines 534-546) then run entirely in
Node over that full in-memory set, and pagination is applied last via a
plain array slice:

```typescript
const total = snapshots.length;
const offset = (page - 1) * pageSize;
const pageSnapshots = snapshots.slice(offset, offset + pageSize); // line 553
```

## Why this matters

This is the exact endpoint the product's own performance budget targets —
`test-design-qa.md` NFR-2/SM-4: "All Employees list under 2 seconds at 500+
records with 3 active filters, permission resolution included" (P0-014). At
500 records with 4 history joins each, this may still complete inside 2s
today, but the implementation does not scale sub-linearly, and — separately
— there is currently **zero load-test evidence anywhere in the repo** proving
it holds the line as data grows. This is exactly the risk R-004 ("resolution
cost breaches the 2s budget," score 6) describes.

## Recommended fix

Push filtering, sorting, and pagination down to the Prisma query (`where`,
`orderBy`, `take`/`skip`) instead of materializing the full table in Node.
Custom-field filters/sorts may need a different strategy (they aren't native
columns), but builtin-field filters/sorts and the final pagination step have
no such constraint.

## Related action

Build a k6 harness against the 500+ record seed dataset to get real evidence
for NFR-2 once this is fixed — currently this budget cannot be marked PASS
either way (no measurement exists).

## Source

- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (Performance §Response Time)
- [`_bmad-output/test-artifacts/test-design-qa.md`](../../../../_bmad-output/test-artifacts/test-design-qa.md) (NFR-2/SM-4, P0-014, R-004)
- [`src/modules/directory/field-registry.service.ts:467-563,635-`](../../src/modules/directory/field-registry.service.ts)
