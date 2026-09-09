-- CreateTable
CREATE TABLE "idp_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deadline" DATE NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idp_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idp_records_employeeId_idx" ON "idp_records"("employeeId");

-- AddForeignKey
ALTER TABLE "idp_records" ADD CONSTRAINT "idp_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
