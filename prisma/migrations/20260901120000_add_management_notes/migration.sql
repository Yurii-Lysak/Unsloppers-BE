-- CreateTable
CREATE TABLE "management_notes" (
    "id" TEXT NOT NULL,
    "subjectEmployeeId" TEXT NOT NULL,
    "authorEmployeeId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibleForEmployee" BOOLEAN NOT NULL DEFAULT false,
    "visibleForPm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "management_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "management_notes_subjectEmployeeId_idx" ON "management_notes"("subjectEmployeeId");

-- AddForeignKey
ALTER TABLE "management_notes" ADD CONSTRAINT "management_notes_subjectEmployeeId_fkey" FOREIGN KEY ("subjectEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_notes" ADD CONSTRAINT "management_notes_authorEmployeeId_fkey" FOREIGN KEY ("authorEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
