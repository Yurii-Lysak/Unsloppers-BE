# Backend test coverage is not measured in CI — no threshold gate against the 80%/90% target

- **Priority:** Normal
- **Type:** CI Hardening
- **Component:** Backend / CI
- **Status:** Open

## Description

`test-design-qa.md`'s Exit Criteria define a real target: **≥80% coverage
backend overall, ≥90% branch coverage on the `access` module**. This is not
currently measured:

- `services/backend/package.json` defines a `test:cov` script
  (`jest --coverage`), but the CI `unit-tests` job runs plain `npm test`
  (confirmed by reading `ci.yml` directly), not `test:cov`.
- No `coverageThreshold` key exists in the Jest config block of
  `package.json` — even a local `test:cov` run would report a number without
  gating on it.

## Context

The underlying suite is qualitatively strong — an independent Test Review
(`test-review.md`, 2026-09-05) scored it 81/100 across 82 files with zero
Critical findings, and specifically praised the access-matrix
coverage-collector pattern for making an untested matrix cell fail the build
by name. That's real evidence of thorough testing, but it's not the same as
a measured line/branch percentage against the stated target.

## Recommended fix

Switch the CI `unit-tests` job to `test:cov` (or add a parallel coverage
job) and add a `coverageThreshold` block to the Jest config, scoped at
minimum to the 80% overall / 90% `access`-module targets already defined in
`test-design-qa.md`.

## Source

- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (Maintainability §Test Coverage)
- [`_bmad-output/test-artifacts/test-design-qa.md`](../../../../_bmad-output/test-artifacts/test-design-qa.md) (Exit Criteria)
- [`_bmad-output/test-artifacts/test-review.md`](../../../../_bmad-output/test-artifacts/test-review.md)
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- [`package.json`](../../package.json)
