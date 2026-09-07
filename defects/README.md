# Defect Tracking

Snapshot of defects and test-debt found during the TEA (Test Architect)
workflow passes on 2026-09-05: `bmad-testarch-test-review` and
`bmad-testarch-nfr`, plus the earlier `known-red-diagnosis.md` investigation
from `bmad-testarch-ci`. Mirrors what's tracked on the ClickUp board — kept
here too so fixes can reference the exact file/line evidence directly from
this repo.

Source artifacts (workspace root): `_bmad-output/test-artifacts/{known-red-diagnosis,test-review,nfr-assessment}.md`

## bugs/ — Product defects (ClickUp: filed under "Bugs")

| # | Title | Priority | Status |
| --- | --- | --- | --- |
| 01 | [Build fails — TS2322 in campaigns.service.ts](bugs/01-build-fails-ts2322-campaigns-service.md) | Urgent | Open |
| 02 | [GET /employees leaks builtin fields to every role](bugs/02-employees-list-authorization-gap.md) | Urgent | Resolved — not a bug |
| 03 | [Employee list filters 400 — fieldId stripped in DTO transform](bugs/03-employees-filters-400-dto-defect.md) | High | Open |
| 04 | [No rate limiting on /auth/login or shared-link (R-016)](bugs/04-no-rate-limiting-auth-shared-link.md) | High | Open |
| 05 | [queryEmployees loads full table into memory, no DB pagination](bugs/05-employees-query-full-table-load.md) | High | Open |

## test-debt/ — Test-code quality issues, decisions needed, and open investigations

| # | Title | Priority | Type |
| --- | --- | --- | --- |
| 01 | [S16 fragile substring assertion (false "leak" alarm)](test-debt/01-s16-fragile-substring-assertion.md) | Normal | Test Debt |
| 02 | [Decision: 403 on custom-fields/users routes without Employee record](test-debt/02-decision-403-custom-fields-employee-record.md) | High | Needs Owner Decision |
| 03 | [401s in employee-profile.e2e-spec.ts — session invalidation not root-caused](test-debt/03-investigation-401-employee-profile-session.md) | Normal | Needs Investigation |
| 04 | [matrix-flag-gated.e2e-spec.ts — S7 guarded assertion can silently skip](test-debt/04-matrix-flag-gated-s7-guarded-assertion.md) | High | Test Debt |
| 05 | [matrix-flag-gated.e2e-spec.ts — S16 guarded assertion is the only assertion](test-debt/05-matrix-flag-gated-s16-guarded-assertion-only.md) | High | Test Debt |
| 06 | [users.e2e-spec.ts — test-order dependency via shared state](test-debt/06-users-e2e-test-order-dependency.md) | High | Test Debt |
| 07 | [action-items.e2e-spec.ts — oversized file (~1,633 lines)](test-debt/07-action-items-e2e-oversized-file.md) | High | Test Debt |
| 08 | [employees.e2e-spec.ts — duplicated inline fixture (4+ times)](test-debt/08-employees-e2e-duplicated-fixture.md) | Normal | Test Debt |
| 09 | [employees.e2e-spec.ts — multi-concern test bundling](test-debt/09-employees-e2e-multi-concern-test.md) | Normal | Test Debt |
| 10 | [Decision: filtering a hidden field should 400 or degrade with `filtersHidden`?](test-debt/10-employees-e2e-stale-400-vs-filtershidden.md) | High | Needs Owner Decision |

## ci-hardening/ — Missing CI gates (process, not per-request bugs)

| # | Title | Priority |
| --- | --- | --- |
| 01 | [npm audit not gated in CI (+ current vulnerabilities)](ci-hardening/01-npm-audit-not-gated.md) | Normal |
| 02 | [Test coverage not measured/gated in CI](ci-hardening/02-coverage-not-gated.md) | Normal |
| 03 | [Unstructured logging, no error tracking](ci-hardening/03-unstructured-logging-no-error-tracking.md) | Normal |
| 04 | [AD-10 generated-type diff gate not wired into CI](ci-hardening/04-ad10-type-diff-gate-not-wired.md) | Low-Normal |

## Already filed in ClickUp

Items 01-03 under `bugs/` were filed first (before this folder existed); the
rest were drafted after. Update the `Status`/`ClickUp` line at the top of
each file as they move through the board so this folder and ClickUp don't
drift apart.

## Not yet committed

These files are created but **not staged or committed** — per this repo's
policy, staging/committing is a separate, explicit step. Branch:
`docs/defect-tracking` (created from `chore/testarch-ci-pipeline`).
