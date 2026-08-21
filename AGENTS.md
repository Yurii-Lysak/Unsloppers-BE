<!-- bmad:context -->
<!-- Verified 2026-08-21 against c3126e8. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## people management backend

NestJS 11 API for the people management product — Prisma 7, PostgreSQL 18 (Docker), Jest unit + e2e. This repo is the `services/backend` submodule; product scope lives in the workspace repo at `docs/project-requirements.md`.

## Policy

- Commit application changes here, not the workspace root — the parent repo holds only BMad artifacts and submodule gitlinks.
- Never commit or push to `main` — work on a feature branch; opening a PR is a separate explicit ask.
- Never stage or commit unless explicitly asked — leave review to the developer.
- Never hand-edit `src/generated/` — run `npm install` or `prisma generate` instead.
- Never edit applied files under `prisma/migrations/` — create a new migration instead.

## Where things are

- Stack overview and commands: `CLAUDE.md`
- Per-area conventions (path-triggered): `.claude/rules/` — modules, prisma, config, e2e
- Reference feature module: `src/modules/users/`
- Normative product requirements: `../../docs/project-requirements.md` (workspace repo)
- Frontend SPA (separate submodule): `../frontend/` — CORS default `http://localhost:4200`

## Running and verifying

- Run `nvm use` first — Node 22 required (`.nvmrc`); Prisma 7 fails on Node 23.
- Run all npm scripts from this directory — the workspace root has no backend toolchain.
- E2e tests need Postgres running first: `npm run db:up`, then `npm run test:e2e`.
- Jest scripts use `cross-env NODE_OPTIONS=--experimental-vm-modules` — required for Prisma 7; do not remove or revert to inline `VAR=value` (breaks on Windows).

## Conventions that differ from defaults

- Controllers get `/api/v1/...` from `main.ts` — never hardcode the global prefix or version on routes.
- DTO and entity fields use definite assignment (`!`) — ValidationPipe instantiates them, not constructors.
- New env variables go in `.env`, `.env.example`, and `src/config/env.validation.ts` — missing Joi entries are silently dropped from config access.
- Read config via `ConfigService` only — no `process.env` in application code except `prisma.config.ts`.
- Scaffold features with `nest g resource modules/<name> --no-spec`, then reshape to match `src/modules/users/`; see `.claude/rules/nest-modules.md`.

## Known pitfalls

- Prisma 7 datasource URL lives in `prisma.config.ts`, not `schema.prisma`.
- E2e test apps do not inherit `main.ts` bootstrap — request `/users`, not `/api/v1/users`; re-apply `ValidationPipe` manually in tests.
- Import supertest as default: `import request from 'supertest'` — namespace import is not callable.
- PG18 Docker volume mounts at `/var/lib/postgresql`, not `.../data`.

<!-- /bmad:context -->
