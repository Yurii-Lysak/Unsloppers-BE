# Generated-type diff check (AD-10) is documented as "Ready" but not actually wired into CI

- **Priority:** Low-Normal
- **Type:** CI Hardening
- **Component:** Frontend + Backend / CI
- **Status:** Open

## Description

`test-design-qa.md`'s Tooling table marks the `openapi-typescript` diff check
as "Already in the frontend toolchain... Ready," and P1-012 names it as a
CI-enforced invariant. Reading both `services/backend/.github/workflows/
ci.yml` and `services/frontend/.github/workflows/test.yml` in full found
**no diff/openapi step in either** — `lint-typecheck` on the frontend runs
`eslint`/`tsc` only, not a schema-diff check, and no equivalent step exists
on the backend.

## Note

This may simply not have been wired yet despite the tooling being present —
recorded as a gap between the plan and the CI file actually on disk, not
asserted as definitely broken (the diff tooling itself wasn't independently
re-verified beyond reading the two workflow files).

## Recommended fix

If this gate is still intended to be enforced, add the `openapi-typescript`
diff step to CI; if it's no longer considered necessary, update
`test-design-qa.md`'s Tooling table to reflect that decision instead of
leaving it marked "Ready."

## Source

- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (Maintainability §"Other Maintainability-relevant findings")
- [`_bmad-output/test-artifacts/test-design-qa.md`](../../../../_bmad-output/test-artifacts/test-design-qa.md) (Tooling table, P1-012)
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- [`../frontend/.github/workflows/test.yml`](../../../frontend/.github/workflows/test.yml)
