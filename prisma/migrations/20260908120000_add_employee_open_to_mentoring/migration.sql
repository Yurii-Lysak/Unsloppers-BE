-- Story 9.1 — self-declared willingness to mentor on Employee.
ALTER TABLE "employees" ADD COLUMN "openToMentoring" BOOLEAN NOT NULL DEFAULT false;
