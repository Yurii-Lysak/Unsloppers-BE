# employees.e2e-spec.ts duplicates the same 6-call Prisma fixture 4+ times

- **Priority:** Normal
- **Type:** Test Debt
- **Component:** Backend / Test Suite (Employees)
- **Status:** Open

## Description

Ten other e2e spec files import and reuse `createEmployeeUser`/
`loginAsEmployee` from `test/support/employee-users.ts`.
`test/employees.e2e-spec.ts` instead defines its own local
`createEmployeeUser` (different parameters: `tenureStart`, `grade`) and
repeats the same six-call Prisma sequence — create `User`, create `Employee`,
then `gradeHistory`/`positionHistory`/`departmentHistory`/
`employmentTypeHistory`, each with a matching `effectiveFrom` — inline,
near-verbatim, at least four times across the "inline-edit" test group (lines
~433-483, 556-609, 625-674, 692-732):

```typescript
const reportUser = await testApp.prisma.user.create({ data: { email: '...', name: 'Report', passwordHash: await hash(PASSWORD, 12) } });
const report = await testApp.prisma.employee.create({ data: { id: reportUser.id, userId: reportUser.id, managerId: manager.employeeId } });
const reportStart = new Date('2020-01-01T00:00:00.000Z');
await testApp.prisma.gradeHistory.create({ data: { employeeId: report.id, value: 'Mid', effectiveFrom: reportStart } });
await testApp.prisma.positionHistory.create({ data: { employeeId: report.id, value: 'Engineer', effectiveFrom: reportStart } });
await testApp.prisma.departmentHistory.create({ data: { employeeId: report.id, value: 'Engineering', effectiveFrom: reportStart } });
await testApp.prisma.employmentTypeHistory.create({ data: { employeeId: report.id, value: 'Full-time', effectiveFrom: reportStart } });
```

## Why this matters

A future schema change to the four history tables (a real possibility —
Story 1.20's temporal-history extension already changes shape on this
boundary) would need fixing in four places instead of one.

## Recommended fix

Extract a second helper, e.g.:

```typescript
async function createFullyOnboardedReport(
  testApp: TestApp,
  managerId: string,
  overrides: Partial<{ email: string; grade: string; tenureStart: string }> = {},
): Promise<EmployeeUser> {
  const report = await createEmployeeUser(testApp, overrides.email ?? `report-${randomUUID()}@example.com`, 'Report', overrides.tenureStart ?? '2020-01-01', overrides.grade ?? 'Mid');
  await testApp.prisma.employee.update({ where: { id: report.employeeId }, data: { managerId } });
  return report;
}
```

## Source

- [`_bmad-output/test-artifacts/test-review.md`](../../../../_bmad-output/test-artifacts/test-review.md) (Recommendation 4, Row M2)
- [`test/employees.e2e-spec.ts:433-483,556-609,625-674,692-732`](../../test/employees.e2e-spec.ts)
