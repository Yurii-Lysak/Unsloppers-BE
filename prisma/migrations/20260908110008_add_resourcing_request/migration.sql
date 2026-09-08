-- CreateEnum
CREATE TYPE "ResourcingRequestStatus" AS ENUM ('open');

-- CreateTable
CREATE TABLE "resourcing_requests" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "vacancyDetails" TEXT NOT NULL,
    "expectedCompBand" VARCHAR(200) NOT NULL,
    "duration" VARCHAR(200) NOT NULL,
    "workload" VARCHAR(200) NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "department" VARCHAR(200) NOT NULL,
    "projectId" VARCHAR(128),
    "status" "ResourcingRequestStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resourcing_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resourcing_requests_authorId_idx" ON "resourcing_requests"("authorId");

-- CreateIndex
CREATE INDEX "resourcing_requests_projectId_idx" ON "resourcing_requests"("projectId");

-- AddForeignKey
ALTER TABLE "resourcing_requests" ADD CONSTRAINT "resourcing_requests_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
