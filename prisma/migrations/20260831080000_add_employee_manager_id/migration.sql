-- Story 1.1 (Derive Manager Access from Reporting Hierarchy) — `managerId`
-- is the reports-to edge C1 AccessResolver's ReportingLine closure walks.
-- Nullable: top-of-chain employees have no manager. `ON DELETE SET NULL`
-- orphans direct reports to top-of-chain rather than re-linking them to the
-- grand-manager (see spec-1-1 Design Notes) — no automatic reassignment.
-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "managerId" TEXT;

-- CreateIndex
CREATE INDEX "employees_managerId_idx" ON "employees"("managerId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
