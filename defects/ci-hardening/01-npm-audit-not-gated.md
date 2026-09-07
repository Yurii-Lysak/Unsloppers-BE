# Neither CI workflow runs npm audit — dependency vulnerabilities are unmonitored

- **Priority:** Normal
- **Type:** CI Hardening
- **Component:** Backend + Frontend / CI
- **Status:** Open

## Description

Live `npm audit --json` run against both services (2026-09-05):

- **Backend:** 8 total (0 critical, **7 high**, 1 moderate) — all transitive:
  `js-yaml` (via `@nestjs/swagger`), `deepmerge-ts`/`mysql2` (via Prisma's own
  tooling, not the runtime client path this app uses), `fast-uri`, `qs`. All
  have `fixAvailable` (several via a Prisma major-version bump).
- **Frontend:** 13 total (0 critical, **10 high**, 3 moderate) — mostly
  transitive dev-tooling (`postcss`, `browserslist`, `js-yaml`, `nanoid`,
  `brace-expansion`), plus **one direct high dependency**: `react-router-dom`
  → `react-router` — GHSA-qwww-vcr4-c8h2 ("RSC Mode CSRF Bypass"), fix
  available, non-major bump.

Confirmed by reading both `services/backend/.github/workflows/ci.yml` and
`services/frontend/.github/workflows/test.yml` in full: **neither runs
`npm audit`** anywhere in the pipeline. Nothing would flag a new critical
vulnerability landing on `main` today.

No critical-severity findings today — this is not an active exploit — but the
current clean bill of health is a matter of timing, not a gate.

## Recommended fix

1. Update `react-router-dom` to the patched version (direct dependency, low
   effort).
2. Add an `npm audit --audit-level=high` (or similar) step to both CI
   workflows.

## Source

- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (Security §Vulnerability Management)
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- [`../frontend/.github/workflows/test.yml`](../../../frontend/.github/workflows/test.yml)
