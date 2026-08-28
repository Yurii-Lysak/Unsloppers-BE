-- Story 1.16 (Pseudonymized Seed Data Tool) — `hash`/`countryCode` are the
-- two remaining TimeTracker-sourced `Employee` fields (per
-- docs/api-external-openapi.json) that had no column on `users` yet.
-- Nullable: rows created outside the seed path (existing users CRUD module)
-- never populate these.
-- AlterTable
ALTER TABLE "users" ADD COLUMN "hash" TEXT,
ADD COLUMN "countryCode" TEXT;
