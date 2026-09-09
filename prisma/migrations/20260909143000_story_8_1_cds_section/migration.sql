-- CreateTable
CREATE TABLE "skills_matrix_entries" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_matrix_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cds_assessments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "assessor" TEXT NOT NULL,
    "resultLink" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cds_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skills_matrix_entries_departmentId_idx" ON "skills_matrix_entries"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "skills_matrix_entries_departmentId_position_key" ON "skills_matrix_entries"("departmentId", "position");

-- CreateIndex
CREATE INDEX "cds_assessments_employeeId_idx" ON "cds_assessments"("employeeId");

-- AddForeignKey
ALTER TABLE "skills_matrix_entries" ADD CONSTRAINT "skills_matrix_entries_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cds_assessments" ADD CONSTRAINT "cds_assessments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
