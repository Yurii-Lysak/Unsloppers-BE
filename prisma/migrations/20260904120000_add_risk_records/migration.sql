-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'need_attention', 'medium', 'high', 'leaver');

-- CreateTable
CREATE TABLE "risk_records" (
    "id" TEXT NOT NULL,
    "subjectEmployeeId" TEXT NOT NULL,
    "authorEmployeeId" TEXT NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "details" TEXT NOT NULL,
    "recordedAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_records_subjectEmployeeId_idx" ON "risk_records"("subjectEmployeeId");

-- AddForeignKey
ALTER TABLE "risk_records" ADD CONSTRAINT "risk_records_subjectEmployeeId_fkey" FOREIGN KEY ("subjectEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_records" ADD CONSTRAINT "risk_records_authorEmployeeId_fkey" FOREIGN KEY ("authorEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
