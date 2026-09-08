-- CreateTable
CREATE TABLE "feedback_records" (
    "id" TEXT NOT NULL,
    "subjectEmployeeId" TEXT NOT NULL,
    "authorEmployeeId" TEXT NOT NULL,
    "recordedAt" DATE NOT NULL,
    "context" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "sharedWithEmployee" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_records_subjectEmployeeId_idx" ON "feedback_records"("subjectEmployeeId");

-- AddForeignKey
ALTER TABLE "feedback_records" ADD CONSTRAINT "feedback_records_subjectEmployeeId_fkey" FOREIGN KEY ("subjectEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_records" ADD CONSTRAINT "feedback_records_authorEmployeeId_fkey" FOREIGN KEY ("authorEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
