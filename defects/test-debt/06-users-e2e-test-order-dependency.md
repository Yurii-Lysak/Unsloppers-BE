# users.e2e-spec.ts chains state across independent tests with no reset

- **Priority:** High
- **Type:** Test Debt
- **Component:** Backend / Test Suite (Users)
- **Status:** Open

## Description

Every other e2e file in the suite either calls `testApp.resetDatabase()` in a
`beforeEach`, or keeps each test fully self-contained. `test/users.e2e-spec.ts`
does neither: it declares `let createdId: string;` at describe scope (line
12), sets it in the `POST` test, and three later, independent `it` blocks
(`PATCH`, `DELETE`, and the final 403-after-deletion check, lines 24-79) all
read that same variable with no reset in between:

```typescript
let createdId: string;
it('POST /api/v1/users creates a user', async () => { /* ...; createdId = body.id; */ });
it('PATCH /api/v1/users/:id updates the name', async () => {
  const res = await agent.patch(`/api/v1/users/${createdId}`) /* ... */;
});
it('DELETE /api/v1/users/:id returns 204', () => agent.delete(`/api/v1/users/${createdId}`).expect(204));
it('GET /api/v1/users/:id after deletion returns 403', () =>
  agent.get(`/api/v1/users/${createdId}`).expect(403)); // depends on DELETE having already run
```

## Why this matters

This passes today only because Jest runs `it` blocks in declaration order by
default. It would break silently under `--randomize`, under `.only`-ing a
later test in isolation, or under any future runner that parallelizes within
a file. `test-design-qa.md` names exactly this class of bug as R-002
("shared-DB parallelism false greens," score 9) and as entry criterion TC-2 —
this file is the one place in the 82-file suite where that guarantee doesn't
hold. A developer debugging just the `DELETE` test in isolation gets a
confusing `undefined` in the URL instead of a clear signal.

## Recommended fix

Collapse into one test expressing the lifecycle explicitly, or give each test
its own fixture:

```typescript
it('supports the full create -> update -> delete -> 403 lifecycle for one user', async () => {
  const created = await agent.post('/api/v1/users').send({ email, name: 'E2E User' }).expect(201);
  const id = created.body.id;
  await agent.patch(`/api/v1/users/${id}`).send({ name: 'Renamed User' }).expect(200);
  await agent.delete(`/api/v1/users/${id}`).expect(204);
  await agent.get(`/api/v1/users/${id}`).expect(403);
});
```

## Source

- [`_bmad-output/test-artifacts/test-review.md`](../../../../_bmad-output/test-artifacts/test-review.md) (Recommendation 3, Row H4)
- [`test/users.e2e-spec.ts:12,24-79`](../../test/users.e2e-spec.ts)
