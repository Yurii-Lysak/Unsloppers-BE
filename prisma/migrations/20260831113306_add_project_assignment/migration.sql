-- CreateTable
CREATE TABLE "project_assignments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pmId" TEXT NOT NULL,
    "dmId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_assignments_employeeId_idx" ON "project_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "project_assignments_projectId_idx" ON "project_assignments"("projectId");

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_dmId_fkey" FOREIGN KEY ("dmId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
