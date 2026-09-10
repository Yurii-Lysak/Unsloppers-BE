-- CreateEnum
CREATE TYPE "PersonalContactMethodType" AS ENUM ('PHONE', 'EMAIL', 'MESSENGER');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "placeOfStay" TEXT,
ADD COLUMN     "residentialAddress" TEXT;

-- CreateTable
CREATE TABLE "personal_contact_methods" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "PersonalContactMethodType" NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_contact_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personal_contact_methods_employeeId_idx" ON "personal_contact_methods"("employeeId");

-- CreateIndex
CREATE INDEX "emergency_contacts_employeeId_idx" ON "emergency_contacts"("employeeId");

-- AddForeignKey
ALTER TABLE "personal_contact_methods" ADD CONSTRAINT "personal_contact_methods_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
