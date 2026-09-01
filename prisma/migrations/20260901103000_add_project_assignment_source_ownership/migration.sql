-- CreateEnum
CREATE TYPE "ProjectAssignmentSource" AS ENUM ('manual', 'timetracker');

-- AlterTable
ALTER TABLE "project_assignments"
ADD COLUMN "source" "ProjectAssignmentSource" NOT NULL DEFAULT 'manual',
ADD COLUMN "sourceKey" TEXT;

-- AddCheckConstraint
ALTER TABLE "project_assignments"
ADD CONSTRAINT "project_assignments_source_key_ownership_check"
CHECK (
  ("source" = 'timetracker' AND "sourceKey" IS NOT NULL)
  OR ("source" = 'manual' AND "sourceKey" IS NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "project_assignments_sourceKey_key" ON "project_assignments"("sourceKey");

-- CreateIndex
CREATE INDEX "project_assignments_source_idx" ON "project_assignments"("source");
