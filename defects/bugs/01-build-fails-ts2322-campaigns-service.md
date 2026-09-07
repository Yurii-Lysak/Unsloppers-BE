# Build fails — TS2322 type error in campaigns.service.ts blocks deploy

- **Priority:** Urgent
- **Component:** Backend / Campaigns
- **Severity:** Blocker (deploy)
- **Status:** Fixed
- **ClickUp:** Filed

## Description

`nest build` fails to compile on `origin/main`. `saveAudience` writes
`normalized.filters` (typed as `FieldFilter[]`) directly into the
`audienceFilters` Json column via `formCampaign.updateMany`, but Prisma
expects `Prisma.InputJsonValue`.

## Error

```
src/modules/campaigns/campaigns.service.ts:146:9 - error TS2322
Type 'FieldFilter[]' is not assignable to type 'JsonNullClass | InputJsonValue | undefined'
```

## Impact

Render's build command is `npm install --include=dev && npm run build`. Since
`nest build` fails, the backend deploy should be failing on every push to
`main` right now, and production is likely serving an older build than the
current `main` tip. Confirm in the Render dashboard.

## Suggested fix

There is already an established pattern for this exact problem elsewhere in
the codebase — `toJsonValue()` in `src/modules/timeline/timeline.service.ts`
(~line 245) and `timeline-event-writer.service.ts` (~line 76), both of which
return `Prisma.InputJsonValue | typeof Prisma.DbNull`. The read side of
campaigns already goes through `parseStoredAudienceFilters` — only the write
side is untyped. Apply the same pattern here.

## Caution

Fixing this re-enables auto-deploy on the next push to `main`, and
`postbuild` runs `prisma migrate deploy` against the shared Neon database (no
staging tier, no separate dev DB per `docs/deployment.md`). The risky part is
the deploy trigger, not the type fix itself — plan the merge accordingly.

## Source

- [`_bmad-output/test-artifacts/known-red-diagnosis.md`](../../../../_bmad-output/test-artifacts/known-red-diagnosis.md) (item 1)
- [`_bmad-output/test-artifacts/ci-pipeline-progress.md`](../../../../_bmad-output/test-artifacts/ci-pipeline-progress.md)
- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (Release Blocker #2)
- [`src/modules/timeline/timeline.service.ts`](../../src/modules/timeline/timeline.service.ts) (`toJsonValue` pattern, ~line 245)
