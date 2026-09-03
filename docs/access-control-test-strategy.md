# Access-Control Test Strategy

This document describes how access-control correctness is tested in the backend (AD-13 / Story 1.15). It complements `test/support/access-matrix.ts`, which mirrors `_bmad-output/specs/spec-people-management-platform/access-model.md`.

## Coverage partition

| Layer | Pairs | Gate |
|-------|-------|------|
| **80-pair oracle** | 16 sections × 5 audiences (`self`, `reportingLine`, `pp`, `colleague`, `sharedLink`) | `assertMatrixCoverage()` in `jest-e2e.global-teardown.ts` |
| **Project line (AD-14)** | Narrowed cells outside the 80-pair matrix | `assertDeniedMatrixCoverage()` + `projectLineDeniedCells()` (Story 1.14) |
| **Flag-gated carve-outs** | S7 visibility, S1 mentor, S10/S11 narrowing, etc. | `assertFlagGatedCoverage()` |

Project line is **not** a sixth column in `ACCESS_MATRIX`. Positive Project-line grants are covered by overlap e2e, graph-factory oracle tests, and provider/leak suites — not the 80-pair gate.

## File map

| File | Role |
|------|------|
| `test/support/access-matrix.ts` | Machine-readable matrix; `assertMatrixCoverage`, `assertDeniedMatrixCoverage` |
| `test/support/matrix-coverage-collector.ts` | `recordMatrixCoverage` / `recordDeniedCoverage` with dedupe |
| `test/support/graph-factory.ts` | Spec oracle: `reportingLine` vs `projectLine` split |
| `test/support/matrix-actors.ts` | Pseudonymized e2e actors (bootcamp seed pattern) |
| `src/modules/access/__tests__/access-resolver.service.spec.ts` | Master C1 unit suite (cache off) |
| `test/access-matrix-positive.e2e-spec.ts` | Records 64 C1 pairs via profile API |
| `test/access-matrix-leaks.e2e-spec.ts` | Denial harness (Story 1.14); dual-records denied pairs |
| `test/access-matrix-overlap.e2e-spec.ts` | AD-15 PP ∩ ProjectLine union |
| `test/shared-links.e2e-spec.ts` | Shared-link flows; AD-16 re-clamp; `sharedLink` column recording |
| `test/cross-feature-access.exemplar.e2e-spec.ts` | Harness exemplar until Epic 6 resourcing routes exist |
| `test/jest-e2e.global-teardown.ts` | Final 80-pair `assertMatrixCoverage` after all e2e files |

## Jest orchestration

- E2e: `npm run test:e2e:serial` (`--runInBand`) so collector state is shared across files in one process.
- `resetMatrixCoverage()` and `resetDeniedCoverage()` run once in `jest-e2e.global-setup.ts` before any e2e file.
- `assertMatrixCoverage(getRecordedMatrixPairs())` runs in `jest-e2e.global-teardown.ts` after all matched suites finish (file-based collector under `test/support/.matrix-coverage-run/`).
- `recordMatrixCoverage` dedupes on `section/audience`; unit and e2e may both record the same pair safely.
- Per-provider denied tests call `recordDeniedCoverage` only; profile leak e2e dual-records for the 80-pair gate.

## CI

Workflow: `.github/workflows/ci.yml`

- `depcruise` — module boundaries (Story 1.19)
- `npm test` — unit suites including `access-resolver.service.spec.ts`
- `npm run lint`
- `npm run test:e2e:serial -- --testPathPatterns='access-matrix|matrix-flag|shared-links|cross-feature-access'` with Postgres 18 service and `npm run db:deploy`

## Extending coverage (Epics 4–6)

1. Add relationship/fixture rules to `graph-factory.ts` or a feature-specific seed helper.
2. Add matrix rows or a feature catalog entry in `access-matrix.ts` (or a sibling catalog) when the spec changes.
3. Add parameterized e2e beside the feature module; call `recordMatrixCoverage` or a future feature collector.
4. Document the new surface in this file and ensure the CI e2e job pattern includes the new spec file.

### Epic 6 Resourcing migration

Until resourcing routes exist, `cross-feature-access.exemplar.e2e-spec.ts` asserts that a ProjectLine PM without a subject relationship cannot `GET /employees/:id/profile` (403 or 404). When Epic 6 ships, replace the exemplar with route-level tests on the resourcing API using the same collector and assertion helpers (`matrix-leak-assertions.ts`, `recordMatrixCoverage`).

## Test data

Use pseudonymized fixtures only — `test/support/matrix-actors.ts`, `test/support/bootcamp-seed.ts`, or story-local seeds with `@example.com` emails. Never embed real PII in tests, logs, or the repository.
