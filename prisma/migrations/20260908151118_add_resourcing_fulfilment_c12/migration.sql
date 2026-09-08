-- CreateEnum
CREATE TYPE "ResourcingProposalStatus" AS ENUM ('proposed');

-- AlterEnum
ALTER TYPE "ResourcingRequestStatus" ADD VALUE 'pending_dm_review';

-- AlterTable
ALTER TABLE "resourcing_requests" ADD COLUMN     "reviewingDmId" TEXT;

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resourcing_proposals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "candidateEmployeeId" TEXT,
    "peopleForceCandidateId" VARCHAR(128),
    "peopleForceCandidateUrl" VARCHAR(2000),
    "status" "ResourcingProposalStatus" NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resourcing_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "departments_parentId_idx" ON "departments"("parentId");

-- CreateIndex
CREATE INDEX "departments_managerId_idx" ON "departments"("managerId");

-- CreateIndex
CREATE INDEX "resourcing_proposals_requestId_idx" ON "resourcing_proposals"("requestId");

-- CreateIndex
CREATE INDEX "resourcing_proposals_candidateEmployeeId_idx" ON "resourcing_proposals"("candidateEmployeeId");

-- CreateIndex
CREATE INDEX "resourcing_requests_reviewingDmId_idx" ON "resourcing_requests"("reviewingDmId");

-- AddForeignKey
ALTER TABLE "resourcing_requests" ADD CONSTRAINT "resourcing_requests_reviewingDmId_fkey" FOREIGN KEY ("reviewingDmId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resourcing_proposals" ADD CONSTRAINT "resourcing_proposals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "resourcing_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resourcing_proposals" ADD CONSTRAINT "resourcing_proposals_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resourcing_proposals" ADD CONSTRAINT "resourcing_proposals_candidateEmployeeId_fkey" FOREIGN KEY ("candidateEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
