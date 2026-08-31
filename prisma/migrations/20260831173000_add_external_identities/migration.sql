-- CreateEnum
CREATE TYPE "ExternalIdentitySystem" AS ENUM ('peopleforce', 'timetracker');

-- CreateTable
CREATE TABLE "external_identities" (
    "id" TEXT NOT NULL,
    "system" "ExternalIdentitySystem" NOT NULL,
    "externalId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "supersededBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_identities_employeeId_idx" ON "external_identities"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_system_externalId_key" ON "external_identities"("system", "externalId");

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
